// ============================================================
// 统一推演入口
// Dashboard 与 Ledger 月度对账共用：避免两个页面各自组装参数，
// 导致同一个月出现两个不同的「预测结余」。
// 所有口径（起征点、任职月数、历史薪资校准、还款筛选）只在这里定义一次。
// ============================================================
import { calcNetSalary, computeCashflow, computeMultiMonth, serviceMonthIndex, ensureRecurringRepayment } from './useCashflow'
import { USER_DEFAULTS } from '../lib/constants'
import { readPref, readExpenseSpreadMode, readSalaryYtd } from '../lib/prefs'
import { parseInsuranceRules, computeCompanyCost } from '../lib/insurance'
import { round2 } from '../lib/validation'

const pad = (n) => String(n).padStart(2, '0')

// ============================================================
// 已记流水 → 按日聚合的「预算之外实际发生额」
// 固定开支 / 还款是预算线，手动与 AI 流水是实际发生的额外收支；
// 两者叠加才是完整现金流（PRD FR-07 / FR-09）。
// 不传 actuals 时返回全空，与旧推演口径逐分一致。
// ============================================================
export function buildActualsExtras(actuals = [], year, month) {
  const ym = `${year}-${pad(month)}`
  const income = {}
  const expense = {}
  const items = {}
  for (const t of (Array.isArray(actuals) ? actuals : [])) {
    const ds = String(t?.txn_date || t?.date || '')
    if (ds.slice(0, 7) !== ym) continue
    const d = Number(ds.slice(8, 10))
    if (!Number.isInteger(d) || d < 1 || d > 31) continue
    const amt = round2(Math.abs(Number(t.amount) || 0))
    if (!amt) continue
    const isIncome = t.direction === 'income' || t.direction === '收入'
    const entry = {
      name: t.category || (isIncome ? '已记收入' : '已记支出'),
      amount: isIncome ? amt : -amt,
      spread: false, actual: true,
      note: String(t.note || '')
    }
    if (isIncome) income[d] = round2((income[d] || 0) + amt)
    else expense[d] = round2((expense[d] || 0) + amt)
    ;(items[d] = items[d] || []).push(entry)
  }
  return { income, expense, items }
}

export function buildActualsByMonth(actuals = [], year, month, months = 1) {
  const out = {}
  for (let i = 0; i < months; i++) {
    const d = new Date(year, month - 1 + i, 1)
    const y = d.getFullYear()
    const m = d.getMonth() + 1
    out[`${y}-${pad(m)}`] = buildActualsExtras(actuals, y, m)
  }
  return out
}

// 年内已发生月份的真实薪资，用于累计预扣法精确重算
export function getYtdMonths(year, month) {
  const list = readSalaryYtd([])
  if (!Array.isArray(list)) return []
  return list
    .filter((r) => Number(r.month) < month && Number(r.preTax) > 0)
    .sort((a, b) => a.month - b.month)
    .map((r) => ({ preTax: Number(r.preTax), insuranceTotal: Number(r.insuranceTotal) || 0 }))
}

export function buildProjection({
  app,
  startBalance = 0,
  assumePreTax = null,
  year,
  month,
  recurringRepayment = 0,
  months = 6,
  actuals = [],
  // 情景模拟：一次性补贴按到账日进入统一推演（不再是展示层加法）
  bonus = null
}) {
  const hireDate = app.profile?.hire_date || USER_DEFAULTS.hireDate
  const payDay = app.profile?.pay_day ?? USER_DEFAULTS.payDay
  const taxThreshold = app.profile?.tax_threshold ?? USER_DEFAULTS.taxThreshold
  const monthIndex = serviceMonthIndex(year, month, hireDate)
  const ytd = getYtdMonths(year, month)
  const ytdMonths = ytd.length ? ytd : null
  const taxOptions = { monthIndex, taxThreshold, ytdMonths }

  const salary = app.salaryConfig || {}
  // 社保比例一律读 insurance_rule 表；表为空才回落武汉兜底比例
  const rules = parseInsuranceRules(app.insuranceRules, app.profile?.city || null)
  const salaryOptions = {
    ...taxOptions, rates: rules.personal, companyRates: rules.company
  }
  const netNow = calcNetSalary(salary, salaryOptions)
  // 日度分摊口径由偏好统一决定：所有页面都走这里，绝不各自组装
  const spread = readExpenseSpreadMode() === 'daily'
  const expenses = app.expenses.map((e) => ({
    day: e.deduct_day, name: e.name, amount: e.monthly_amount, spread
  }))
  const repayments = app.repayments.map((r) => ({
    date: r.due_date, name: '还款', amount: r.amount
  }))
  // 单月推演与多月前瞻共用「每月固定还款」补齐规则（抽出纯函数，避免两处漂移）
  const ym = `${year}-${pad(month)}`
  const daysInMonth = new Date(year, month, 0).getDate()
  const monthRepays = ensureRecurringRepayment(repayments, recurringRepayment, ym, payDay, daysInMonth)

  const scenarios = [{ label: '当前薪资', net: netNow.net }]
  if (assumePreTax != null) {
    scenarios.push({
      label: '调薪假设',
      net: calcNetSalary({ ...salary, pre_tax_salary: assumePreTax }, salaryOptions).net
    })
  }

  // 已记流水同时进入单月曲线与多月前瞻，保证仪表盘 / 日历 / 前瞻同源
  const extras = buildActualsExtras(actuals, year, month)
  const bonusAmount = round2(Number(bonus?.amount) || 0)
  if (bonusAmount > 0) {
    const day = Math.min(Math.max(1, Number(bonus?.day) || 15), daysInMonth)
    extras.income[day] = round2((extras.income[day] || 0) + bonusAmount)
    ;(extras.items[day] = extras.items[day] || []).push({
      name: '情景补贴', amount: bonusAmount, spread: false, actual: false,
      note: '试算值 · 不写库'
    })
  }
  const extrasByMonth = buildActualsByMonth(actuals, year, month, months)
  // 补贴是当月一次性收入：只叠加在第一个月，不滚动到未来月份的期初
  if (bonusAmount > 0) {
    const firstKey = `${year}-${pad(month)}`
    const first = extrasByMonth[firstKey]
    if (first) {
      const day = Math.min(Math.max(1, Number(bonus?.day) || 15), daysInMonth)
      first.income[day] = round2((first.income[day] || 0) + bonusAmount)
      ;(first.items[day] = first.items[day] || []).push({
        name: '情景补贴', amount: bonusAmount, spread: false, actual: false,
        note: '试算值 · 不写库'
      })
    }
  }

  const cf = computeCashflow({
    startBalance,
    year,
    month,
    payDay,
    scenarios,
    mainLabel: '当前薪资',
    expenses,
    repayments: monthRepays,
    liabilities: app.liabilities || [],
    recurringRepayment: recurringRepayment,
    extras
  })

  const forecast = computeMultiMonth({
    startBalance,
    year,
    month,
    months,
    payDay,
    salaryConfig: salary,
    expenses,
    repayments,
    recurringRepayment,
    liabilities: app.liabilities || [],
    rates: rules.personal,
    companyRates: rules.company,
    hireDate,
    taxThreshold,
    ytdMonths,
    extrasByMonth
  })

  return {
    cf, forecast, netNow, ytdCount: ytd.length, payDay, monthIndex,
    taxThreshold, rules,
    companyCost: computeCompanyCost(rules.company, salary).total
  }
}

// 日历跨月推演：从基准月（当前月）用多月前瞻滚动到目标月，取该月的期初余额。
// 修复此前「切到 12 月仍从同一个固定余额起算」导致日历与仪表盘相差数百元的问题。
export function buildMonthProjection({
  app, startBalance = 0, recurringRepayment = 0, assumePreTax = null,
  baseYear, baseMonth, year, month, actuals = [], bonus = null
}) {
  const offset = (year - baseYear) * 12 + (month - baseMonth)
  if (offset <= 0) {
    // 历史月份无法由「当前月往未来」滚动得出，不伪造数字，明确标记
    return {
      projection: buildProjection({
        app, startBalance, recurringRepayment, assumePreTax, year, month, months: 1, actuals, bonus
      }),
      startBalance,
      rolled: false
    }
  }
  const anchor = buildProjection({
    app, startBalance, recurringRepayment, assumePreTax,
    year: baseYear, month: baseMonth, months: offset + 1, actuals, bonus
  })
  const rolledStart = anchor.forecast[offset]?.startBalance ?? startBalance
  return {
    projection: buildProjection({
      app, startBalance: rolledStart, recurringRepayment, assumePreTax,
      year, month, months: 1, actuals, bonus
    }),
    startBalance: rolledStart,
    rolled: true
  }
}
