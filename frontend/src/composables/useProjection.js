// ============================================================
// 统一推演入口
// Dashboard 与 Ledger 月度对账共用：避免两个页面各自组装参数，
// 导致同一个月出现两个不同的「预测结余」。
// 所有口径（起征点、任职月数、历史薪资校准、还款筛选）只在这里定义一次。
// ============================================================
import { calcNetSalary, computeCashflow, computeMultiMonth, serviceMonthIndex } from './useCashflow'
import { USER_DEFAULTS } from '../lib/constants'
import { readPref, readExpenseSpreadMode } from '../lib/prefs'
import { parseInsuranceRules, computeCompanyCost } from '../lib/insurance'

const pad = (n) => String(n).padStart(2, '0')

// 年内已发生月份的真实薪资，用于累计预扣法精确重算
export function getYtdMonths(year, month) {
  const list = readPref('salaryYtd', [])
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
  months = 6
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
  // 与 computeMultiMonth 完全相同的「每月固定还款」补齐规则：
  // 该月已录入同额月供则跳过（不重复扣），否则补在发薪日。
  // 单月推演与多月前瞻必须共用这套判断，否则日历与前瞻会差一整笔月供。
  const ym = `${year}-${pad(month)}`
  const daysInMonth = new Date(year, month, 0).getDate()
  const monthRepays = repayments.filter((r) => String(r.date || '').startsWith(ym))
  const recurring = Number(recurringRepayment) || 0
  const alreadyRecorded = monthRepays.some(
    (r) => Math.abs(Number(r.amount) - recurring) < 0.01
  )
  if (recurring > 0 && !alreadyRecorded) {
    monthRepays.push({
      date: `${ym}-${pad(Math.min(Number(payDay) || 15, daysInMonth))}`,
      name: '每月固定还款', amount: recurring
    })
  }

  const scenarios = [{ label: '当前薪资', net: netNow.net }]
  if (assumePreTax != null) {
    scenarios.push({
      label: '调薪假设',
      net: calcNetSalary({ ...salary, pre_tax_salary: assumePreTax }, salaryOptions).net
    })
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
    recurringRepayment: recurring
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
    ytdMonths
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
  baseYear, baseMonth, year, month
}) {
  const offset = (year - baseYear) * 12 + (month - baseMonth)
  if (offset <= 0) {
    // 历史月份无法由「当前月往未来」滚动得出，不伪造数字，明确标记
    return {
      projection: buildProjection({
        app, startBalance, recurringRepayment, assumePreTax, year, month, months: 1
      }),
      startBalance,
      rolled: false
    }
  }
  const anchor = buildProjection({
    app, startBalance, recurringRepayment, assumePreTax,
    year: baseYear, month: baseMonth, months: offset + 1
  })
  const rolledStart = anchor.forecast[offset]?.startBalance ?? startBalance
  return {
    projection: buildProjection({
      app, startBalance: rolledStart, recurringRepayment, assumePreTax,
      year, month, months: 1
    }),
    startBalance: rolledStart,
    rolled: true
  }
}
