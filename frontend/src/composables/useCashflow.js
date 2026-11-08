// ============================================================
// 现金流推演引擎
// ------------------------------------------------------------
// 口径与 product_baseline.json / 0001_init.sql 武汉江汉区社保模板一致。
//
// 业务约定：
// 1. 工资按月固定日发放，当天到账，遇周末 / 法定节假日照发，不做提前或顺延。
// 2. 还款按账单日当天扣款，同样不做顺延。
// 3. 日历属性仅用于展示与解释，不再影响资金流日期。
// 4. 个税采用累计预扣法，按入职月起算任职月份数，跨自然年重置；
//    传入 ytdMonths 时按年内真实历史逐月累计，否则假设年内每月薪资相同。
// 5. 所有金额经 round2 归一，杜绝浮点漂移。
// ============================================================

import { classifyDay } from '../lib/holidays2026'
import { SAFETY_LINE, USER_DEFAULTS } from '../lib/constants'
import { formatMoney } from '../lib/labels'
import { round2 } from '../lib/validation'
import { FALLBACK_PERSONAL, computeCompanyCost } from '../lib/insurance'

// 默认比例只在「insurance_rule 表无数据」时兜底，正常路径一律读表
const RATE = FALLBACK_PERSONAL
const DEFAULT_TAX_THRESHOLD = 5000

// 综合所得年度预扣率表：[累计应纳税所得额上限, 预扣率, 速算扣除数]
const TAX_BRACKETS = [
  [36000, 0.03, 0],
  [144000, 0.10, 2520],
  [300000, 0.20, 16920],
  [420000, 0.25, 31920],
  [660000, 0.30, 52920],
  [960000, 0.35, 85920],
  [Infinity, 0.45, 181920]
]

function annualTax(taxable) {
  if (taxable <= 0) return 0
  const bracket = TAX_BRACKETS.find(([cap]) => taxable <= cap)
  return round2(Math.max(0, taxable * bracket[1] - bracket[2]))
}

// 一组月份累计应纳税额（按实际各月收入与社保，支持调薪场景）
function cumulativeTax(months, taxThreshold) {
  let income = 0
  let insurance = 0
  for (const m of months) {
    income += Number(m.preTax) || 0
    insurance += Number(m.insuranceTotal) || 0
  }
  const taxable = Math.max(0, round2(income - insurance - taxThreshold * months.length))
  return annualTax(taxable)
}

// 本月应预扣 = 截至本月累计应纳税额 − 截至上月累计应纳税额
function monthlyWithholdingTax(preTax, insuranceTotal, monthIndex, taxThreshold, ytdMonths) {
  if (Array.isArray(ytdMonths) && ytdMonths.length) {
    // 精确模式：年内已发生月份用真实薪资，本月用当前档案
    const all = [...ytdMonths, { preTax, insuranceTotal }]
    return round2(Math.max(0, cumulativeTax(all, taxThreshold) - cumulativeTax(all.slice(0, -1), taxThreshold)))
  }
  // 简化模式：假设年内每月薪资与社保相同
  const monthlyTaxable = preTax - insuranceTotal - taxThreshold
  const cumulative = (n) => annualTax(Math.max(0, round2(monthlyTaxable * n)))
  return round2(Math.max(0, cumulative(monthIndex) - cumulative(monthIndex - 1)))
}

// 本年度第几个任职月（个税累计用）；跨自然年重新从第 1 月累计
export function serviceMonthIndex(year, month, hireDate) {
  const h = new Date(`${hireDate || USER_DEFAULTS.hireDate}T00:00:00`)
  const hireYear = h.getFullYear()
  const hireMonth = h.getMonth() + 1
  if (year < hireYear) return 1
  if (year === hireYear) return Math.max(1, month - hireMonth + 1)
  return month
}

// 到手工资 = 税前 − 五险一金个人部分 − 个税
// options: { monthIndex, taxThreshold, ytdMonths }
export function calcNetSalary(salaryConfig, options = {}) {
  // 空档案兜底：没有税前工资时不计算固定扣款，避免出现负的到手工资
  if (!salaryConfig || !Number(salaryConfig.pre_tax_salary)) {
    return { net: 0, insuranceTotal: 0, tax: 0, breakdown: {}, monthIndex: 1 }
  }
  const {
    pre_tax_salary = 0,
    sb_base_pension = 0,
    sb_base_medical = 0,
    sb_base_unemploy = 0,
    sb_base_fund = 0
  } = salaryConfig

  // 比例来自 insurance_rule 表（由 buildProjection 注入），缺省才用武汉兜底
  const rate = { ...RATE, ...(options.rates || {}) }
  const pension = round2(sb_base_pension * (Number(rate.pension) || 0))
  const medical = round2(sb_base_medical * (Number(rate.medical) || 0))
  const unemployment = round2(sb_base_unemploy * (Number(rate.unemployment) || 0))
  const fund = round2(sb_base_fund * (Number(rate.fund) || 0))
  const bigMedical = Number(rate.bigMedicalFixed) || 0
  const insuranceTotal = round2(pension + medical + unemployment + fund + bigMedical)
  // 公司缴纳不从工资里扣，单独列出（PRD FR-03）
  const company = computeCompanyCost(options.companyRates, salaryConfig)

  const rawThreshold = options.taxThreshold
  const taxThreshold = rawThreshold != null && Number.isFinite(Number(rawThreshold)) && Number(rawThreshold) >= 0
    ? Number(rawThreshold)
    : DEFAULT_TAX_THRESHOLD
  const monthIndex = Math.max(1, Number(options.monthIndex) || 1)
  const ytdMonths = Array.isArray(options.ytdMonths) ? options.ytdMonths : null
  const tax = monthlyWithholdingTax(pre_tax_salary, insuranceTotal, monthIndex, taxThreshold, ytdMonths)
  const net = round2(pre_tax_salary - insuranceTotal - tax)
  return {
    net,
    insuranceTotal,
    tax,
    monthIndex,
    taxThreshold,
    breakdown: { pension, medical, unemployment, fund, bigMedical },
    companyTotal: company.total,
    companyBreakdown: company.breakdown
  }
}

// 风险聚合：把逐日信号整理成少量、具体、可行动的风险卡
function buildWarnings(ctx) {
  const {
    month, daily, repayList, payDate, mainNet, monthEnd, monthMin,
    startBalance, safetyLine, liabilities = [], recurringRepayment = 0
  } = ctx
  const out = []
  const dayText = (d) => `${month}月${d}日`
  const money = (n) => formatMoney(n)

  const negDays = daily.filter((x) => x.balance < 0)
  if (negDays.length) {
    const first = negDays[0]
    const worst = negDays.reduce((a, b) => (b.balance < a.balance ? b : a))
    const wait = first.day < payDate ? `，距 ${dayText(payDate)} 发薪还有 ${payDate - first.day} 天` : ''
    out.push({
      level: 'red', kind: 'negative', date: `${month}/${first.day}`, title: '现金转负',
      detail: `${dayText(first.day)} 余额首次跌破 0（${money(first.balance)}），本月共 ${negDays.length} 天为负，最低 ${money(worst.balance)}${wait}。`,
      advice: first.day < payDate
        ? '发薪前避免新增大额支出；如有可协商的账单，提前与平台沟通延后扣款。'
        : '发薪后仍为负，需优先压缩固定开支，或核对是否有待收收入尚未到账。'
    })
  }

  const lowDays = daily.filter((x) => x.balance >= 0 && x.balance < safetyLine)
  if (lowDays.length && !negDays.length) {
    const worst = lowDays.reduce((a, b) => (b.balance < a.balance ? b : a))
    out.push({
      level: 'orange', kind: 'lowBalance', date: `${month}/${worst.day}`, title: '安全垫偏薄',
      detail: `全月有 ${lowDays.length} 天余额低于 ${money(safetyLine)}，最低出现在 ${dayText(worst.day)}，仅 ${money(worst.balance)}。`,
      advice: `建议至少常留 ${money(safetyLine)} 应急金；把可选消费挪到发薪后更稳妥。`
    })
  }

  repayList.slice().sort((a, b) => b.amount - a.amount).slice(0, 3).forEach((r) => {
    const before = r.day > 1 ? daily.find((x) => x.day === r.day - 1) : null
    const available = before ? before.balance : startBalance
    const shortfall = round2(r.amount - Math.max(0, available))
    if (shortfall <= 0) return
    out.push({
      level: shortfall > r.amount * 0.5 ? 'red' : 'yellow',
      kind: 'repayGap', date: `${month}/${r.day}`, title: `${r.name} 可能不够扣`,
      detail: `${dayText(r.day)} 需还 ${money(r.amount)}，前一日预计余额只有 ${money(available)}，缺口约 ${money(shortfall)}。`,
      advice: `发薪后先单独预留 ${money(r.amount)}；若确实吃紧，提前申请延期或分期，别等逾期。`
    })
  })

  if (payDate > 1 && !negDays.length) {
    const pre = daily.find((x) => x.day === payDate - 1)
    if (pre && mainNet > 0 && pre.balance < mainNet * 0.25) {
      out.push({
        level: 'yellow', kind: 'prePayTrough', date: `${month}/${pre.day}`, title: '发薪前低谷',
        detail: `${dayText(pre.day)} 余额降至 ${money(pre.balance)}，是本月发薪前最紧的一天。`,
        advice: '把可以延期的小额消费集中到发薪后 1-2 天，能明显缓解这段时间的压力。'
      })
    }
  }

  const bigOutflow = daily
    .filter((x) => mainNet > 0 && x.outflow > mainNet * 0.5)
    .sort((a, b) => b.outflow - a.outflow)[0]
  if (bigOutflow) {
    out.push({
      level: 'yellow', kind: 'bigOutflow', date: `${month}/${bigOutflow.day}`, title: '单日支出集中',
      detail: `${dayText(bigOutflow.day)} 合计支出 ${money(bigOutflow.outflow)}（${bigOutflow.names || '固定开支 / 还款'}），超过当月到手工资的一半。`,
      advice: '可调整日期的账单尽量错开到相邻几天；固定还款建议提前单独预留资金。'
    })
  }

  if (typeof monthEnd === 'number' && monthEnd < 0) {
    out.push({
      level: 'red', kind: 'monthEnd', date: `${month}/末`, title: '月末仍为负',
      detail: `按当前档案推演，${month} 月末余额 ${money(monthEnd)}，压力会结转到下个月。`,
      advice: '下月需削减固定开支或增加收入；也可在「假设薪资」里试算调薪后能否回正。'
    })
  }

  // 还款冲突（PRD FR-14）：当月应还 > 当月到手，或还款日紧挨发薪日
  const totalRepay = repayList.reduce((s, r) => round2(s + r.amount), 0)
  if (mainNet > 0 && totalRepay > mainNet) {
    out.push({
      level: 'red', kind: 'repayConflict', date: `${month}/全月`, title: '当月应还超过到手',
      detail: `本月合计应还 ${money(totalRepay)}，超过当月到手 ${money(mainNet)}，缺口 ${money(round2(totalRepay - mainNet))}。`,
      advice: '发薪后先单独预留还款金额；若周转不开，提前与平台协商延期，别等逾期。'
    })
  }
  repayList.filter((r) => payDate - r.day >= 0 && payDate - r.day <= 3).forEach((r) => {
    out.push({
      level: 'yellow', kind: 'repayNearPay', date: `${month}/${r.day}`, title: '还款紧挨发薪日',
      detail: `${dayText(r.day)} 需还 ${money(r.amount)}，距 ${dayText(payDate)} 发薪仅 ${payDate - r.day} 天，周转窗口很窄。`,
      advice: '确认工资当天到账时间，留足当日可用余额。'
    })
  })

  // 长期负债负担（PRD FR-14）：按「剩余本金 ÷ 每月固定还款」估算剩余期数
  const inst = liabilities.find(
    (l) => l.type === 'installment' && Number(l.remaining_principal) > 0
  )
  const recurring = Number(recurringRepayment) || 0
  if (inst && recurring > 0) {
    const periods = Math.ceil(Number(inst.remaining_principal) / recurring)
    if (periods >= 6) {
      out.push({
        level: 'yellow', kind: 'longTermDebt', date: `${month}/长期`, title: '长期分期负担',
        detail: `分期剩余本金 ${money(inst.remaining_principal)}，按每月 ${money(recurring)} 估算还需约 ${periods} 期，将持续占用月度现金流。`,
        advice: '有余力时评估提前结清是否更省；在此之前把月供固定计入每月预算。'
      })
    }
  }

  if (!out.length) {
    out.push({
      level: 'info', kind: 'safe', date: `${month}/全月`, title: '本月现金流安全',
      detail: `全月余额保持在安全线以上，最低 ${money(monthMin)}。`,
      advice: '保持当前节奏即可；有余力可以把结余转进应急备用金。'
    })
  }

  const order = { red: 0, orange: 1, yellow: 2, info: 3 }
  return out.sort((a, b) => order[a.level] - order[b.level]).slice(0, 6)
}

// 主推演（金额一律 round2）
export function computeCashflow(params) {
  const {
    startBalance = 0, year, month, payDay = 15,
    scenarios = [], mainLabel = null, expenses = [], repayments = [],
    liabilities = [], recurringRepayment = 0,
    safetyLine = SAFETY_LINE,
    // 已记流水的按日汇总（预算之外的实际发生额）。默认 null = 纯档案预测，
    // 保持既有断言与月度对账口径不变；传入后历史日叠加实际收支，曲线随之更新。
    extras = null
  } = params

  const xIncome = extras?.income || {}
  const xExpense = extras?.expense || {}
  const xItems = extras?.items || {}

  const pad = (n) => String(n).padStart(2, '0')
  const ym = `${year}-${pad(month)}`
  const daysInMonth = new Date(year, month, 0).getDate()
  const clampDay = (d) => Math.min(Math.max(1, Number(d) || 1), daysInMonth)
  const effPayDay = clampDay(payDay)

  const expByDay = {}
  const expNames = {}
  // 逐笔明细：每天到底是哪几笔、各多少钱。日历「当日明细」据此渲染，
  // 不再把多个开支名字用顿号拼成一行让人猜。
  const expItems = {}
  // 有「明确扣费日」的开支当天仍可能被对账逐笔核对，单独记下这些天
  const fixedExpDays = new Set()
  expenses.forEach((e) => {
    const d = clampDay(e.day)
    const amt = Number(e.amount) || 0
    const name = e.name || '固定开支'
    const pushItem = (day, part, isSpread) => {
      ;(expItems[day] = expItems[day] || []).push({
        name, amount: round2(part), spread: isSpread
      })
    }
    if (e.spread === true && amt > 0) {
      // 按日均摊：以「分」为整数单位，余数补给前 N 天，全月合计精确等于原金额
      const cents = Math.round(amt * 100)
      const base = Math.floor(cents / daysInMonth)
      const remainder = cents - base * daysInMonth
      for (let day = 1; day <= daysInMonth; day++) {
        const c = base + (day <= remainder ? 1 : 0)
        const part = round2(c / 100)
        expByDay[day] = round2((expByDay[day] || 0) + part)
        expNames[day] = expNames[day] ? `${expNames[day]}、${name}` : name
        pushItem(day, part, true)
      }
      return
    }
    fixedExpDays.add(d)
    expByDay[d] = round2((expByDay[d] || 0) + amt)
    expNames[d] = expNames[d] ? `${expNames[d]}、${name}` : name
    pushItem(d, amt, false)
  })

  const repayByDay = {}
  const repayItems = {}
  const repayList = []
  repayments.forEach((r) => {
    const ds = String(r.date || '')
    if (ds.slice(0, 7) !== ym) return
    const d = Number(ds.slice(-2))
    if (!Number.isFinite(d) || d < 1 || d > daysInMonth) return
    const amt = Number(r.amount) || 0
    repayByDay[d] = round2((repayByDay[d] || 0) + amt)
    ;(repayItems[d] = repayItems[d] || []).push({ name: r.name || '还款', amount: amt, spread: false })
    repayList.push({ day: d, amount: amt, name: r.name || '还款' })
  })

  const dates = []
  const dayTypes = []
  const events = []
  const series = {}
  scenarios.forEach((s) => (series[s.label] = []))
  const mainKey = mainLabel || (scenarios[0] && scenarios[0].label)
  const mainNet = (scenarios.find((s) => s.label === mainKey) || {}).net || 0

  let balanceMain = startBalance
  let negativeFrom = null
  const daily = []

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${ym}-${pad(d)}`
    dayTypes.push(classifyDay(dateStr))

    const isPay = d === effPayDay
    const actualIn = round2(Number(xIncome[d]) || 0)
    const actualOut = round2(Number(xExpense[d]) || 0)
    const incMain = round2((isPay ? mainNet : 0) + actualIn)
    const expAmt = expByDay[d] || 0
    const repayAmt = repayByDay[d] || 0
    const outflow = round2(expAmt + repayAmt + actualOut)
    const commonDelta = round2(actualIn - outflow)

    if (isPay) events.push({ day: d, type: 'pay', label: '发薪到账', amount: mainNet })
    if (actualIn || actualOut) events.push({
      day: d, type: 'actual', label: '已记流水', amount: round2(actualIn - actualOut),
      items: xItems[d] || []
    })
    // spread 标记：按日均摊的日常零花不是一笔真实账单，对账时不逐笔匹配。
    // label 保留拼接串供图表 tooltip 与既有断言使用；items 供日历逐笔展开。
    if (expAmt) events.push({
      day: d, type: 'expense', label: expNames[d], amount: -expAmt,
      spread: !fixedExpDays.has(d), items: expItems[d] || []
    })
    if (repayAmt) events.push({
      day: d, type: 'repay', label: '还款扣款', amount: -repayAmt,
      items: repayItems[d] || []
    })

    scenarios.forEach((s) => {
      const prev = series[s.label].length ? series[s.label][series[s.label].length - 1] : startBalance
      const inc = isPay ? s.net : 0
      series[s.label].push(round2(prev + inc + commonDelta))
    })

    balanceMain = round2(balanceMain + incMain + commonDelta)
    if (balanceMain < 0 && negativeFrom === null) negativeFrom = d
    daily.push({
      day: d, balance: balanceMain, outflow, income: incMain,
      names: [expNames[d], repayAmt ? '还款扣款' : '',
        (actualIn || actualOut) ? '已记流水' : ''].filter(Boolean).join('、')
    })
    dates.push(`${month}/${d}`)
  }

  const mainSeries = series[mainKey] || []
  const monthMin = mainSeries.length ? Math.min(...mainSeries) : startBalance
  const monthEnd = mainSeries.length ? mainSeries[mainSeries.length - 1] : startBalance

  return {
    dates, dayTypes, events, series, mainSeries, daily, mainLabel: mainKey, effPayDay, negativeFrom,
    warnings: buildWarnings({
      month, daily, repayList, payDate: effPayDay, mainNet,
      monthEnd, monthMin, startBalance, safetyLine,
      liabilities, recurringRepayment
    }),
    monthMin, monthEnd
  }
}

// 每月固定还款补齐（纯函数，单月推演与多月前瞻共用，避免两处漂移导致差一整笔月供）：
// 当月还款日历里已有同额月供则跳过，否则补在发薪日。
export function ensureRecurringRepayment(repayments, recurring, ym, payDay, daysInMonth) {
  const list = (repayments || []).slice()
  const recurringNum = Number(recurring) || 0
  if (recurringNum <= 0) return list
  const alreadyRecorded = list.some(
    (r) => String(r.date || '').slice(0, 7) === ym &&
      Math.abs(Number(r.amount) - recurringNum) < 0.01
  )
  if (!alreadyRecorded) {
    list.push({
      date: `${ym}-${String(Math.min(Number(payDay) || 15, daysInMonth)).padStart(2, '0')}`,
      name: '每月固定还款', amount: recurringNum
    })
  }
  return list
}

// 多月滚动预测：以上月结余作为下月期初，逐月复用日度引擎
export function computeMultiMonth(params) {
  const {
    startBalance = 0, year, month, months = 6, payDay = 15,
    salaryConfig = {}, expenses = [], repayments = [], recurringRepayment = 0,
    liabilities = [], rates = null, companyRates = null,
    hireDate = USER_DEFAULTS.hireDate, taxThreshold = DEFAULT_TAX_THRESHOLD,
    ytdMonths = null,
    // 多月前瞻同样叠加已记流水：{ 'YYYY-MM': extras }
    extrasByMonth = null
  } = params

  const pad = (n) => String(n).padStart(2, '0')
  const result = []
  let balance = startBalance

  for (let i = 0; i < months; i++) {
    const d = new Date(year, month - 1 + i, 1)
    const y = d.getFullYear()
    const m = d.getMonth() + 1
    const ym = `${y}-${pad(m)}`
    const daysInMonth = new Date(y, m, 0).getDate()
    const monthIndex = serviceMonthIndex(y, m, hireDate)
    // 跨自然年：累计归零，历史月份不再参与
    const ytd = y === new Date(`${hireDate}T00:00:00`).getFullYear() ? ytdMonths : null
    const net = calcNetSalary(salaryConfig, {
      monthIndex, taxThreshold, ytdMonths: ytd, rates, companyRates
    }).net

    const monthRepays = ensureRecurringRepayment(
      repayments
        .filter((r) => String(r.date || '').slice(0, 7) === ym)
        .map((r) => ({ date: r.date, name: '还款', amount: r.amount })),
      recurringRepayment, ym, payDay, daysInMonth
    )

    const cf = computeCashflow({
      startBalance: balance, year: y, month: m, payDay,
      scenarios: [{ label: '当前薪资', net }], mainLabel: '当前薪资',
      expenses, repayments: monthRepays, liabilities, recurringRepayment,
      extras: extrasByMonth?.[ym] || null
    })

    const risky = cf.warnings.filter((w) => w.level === 'red' || w.level === 'orange')
    result.push({
      year: y, month: m, label: `${y}年${m}月`,
      startBalance: balance, endBalance: cf.monthEnd, minBalance: cf.monthMin,
      netSalary: net, negativeFrom: cf.negativeFrom,
      topRisk: risky[0]?.title || cf.warnings[0]?.title || '',
      riskLevel: risky[0]?.level || 'info'
    })
    balance = cf.monthEnd
  }

  return result
}
