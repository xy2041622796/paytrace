// ============================================================
// 基准数据预填与只读核对
// 数据来源：product_baseline.json（基准日 2026-10-31）
// 只写本机偏好，绝不改数据库；预填值需用户对照工资条核对，绝不静默覆盖已填内容。
// ============================================================
import { round2 } from './validation'

// 7/13 入职、每月 15 日发薪，baseline 月度现金流表从 8 月起，7 月不发薪故留空。
// 五险一金合计按「税前 − 到手」反推，含 7-10 月每月 54 元社保补差。
// 注：baseline 自身对 8 月扣款有 716.29 / 720.61 两种表述，此处取月度现金流表口径。
export const BASELINE_PRESET = {
  startBalance: 465,
  recurringRepayment: 241,
  salaryYtd: [
    { month: 7, preTax: 0, insuranceTotal: 0 },
    { month: 8, preTax: 4000, insuranceTotal: 716.29 },
    { month: 9, preTax: 4000, insuranceTotal: 720.61 },
    { month: 10, preTax: 4000, insuranceTotal: 720.61 }
  ]
}

// 执行 0002_real_data_seed.sql 后应有的库内结果
export const BASELINE_EXPECTED = {
  preTax: 5000,
  expenseTotal: 1179,
  installment: { date: '2026-11-15', amount: 241 },
  whiteBar: { date: '2026-11-25', amount: 3619.44 },
  liabilities: 3,
  pending: 3
}

export function planBaselinePreset(current = {}) {
  const values = {}
  const applied = []
  const skipped = []
  const n = (v) => Number(v) || 0

  if (n(current.startBalance) > 0) {
    skipped.push(`期初余额已填 ${n(current.startBalance)} 元，保留原值`)
  } else {
    values.startBalance = BASELINE_PRESET.startBalance
    applied.push(`期初余额 → ${BASELINE_PRESET.startBalance} 元（2026-10-31 晚现金余额）`)
  }

  if (n(current.recurringRepayment) > 0) {
    skipped.push(`每月固定还款已填 ${n(current.recurringRepayment)} 元，保留原值`)
  } else {
    values.recurringRepayment = BASELINE_PRESET.recurringRepayment
    applied.push(`每月固定还款 → ${BASELINE_PRESET.recurringRepayment} 元（手机分期月供）`)
  }

  const ytd = Array.isArray(current.salaryYtd) ? current.salaryYtd : []
  if (ytd.some((r) => Number(r?.preTax) > 0)) {
    skipped.push('年内历史薪资已有录入，保留原值（不覆盖工资条数据）')
  } else {
    values.salaryYtd = BASELINE_PRESET.salaryYtd.map((r) => ({ ...r }))
    applied.push('年内历史薪资 → 8/9/10 月税前 4000、五险一金 716.29 / 720.61 / 720.61（7 月留空）')
  }
  return { values, applied, skipped }
}

// 只读核对：库内真实数据是否与基准一致。不同不算错误（用户可能有意调整），只给提示。
export function baselineAlignment({
  salaryConfig, expenses, repayments, liabilities, pending,
  nowYear = 2026, nowMonth = 11
} = {}) {
  const diffs = []
  const checked = []
  const close = (a, b) => Math.abs(round2(Number(a) - Number(b))) < 0.01
  const push = (label, expect, actual, unit = '') => {
    checked.push({ label, expect, actual })
    if (!close(actual, expect)) diffs.push({ label, expect, actual, unit })
  }

  push('税前月薪', BASELINE_EXPECTED.preTax, salaryConfig?.pre_tax_salary, ' 元')
  const total = (Array.isArray(expenses) ? expenses : [])
    .reduce((a, e) => a + (Number(e.monthly_amount) || 0), 0)
  push('月固定开支合计', BASELINE_EXPECTED.expenseTotal, round2(total), ' 元')
  push('负债笔数', BASELINE_EXPECTED.liabilities, (liabilities || []).length, ' 笔')
  push('待收项数', BASELINE_EXPECTED.pending, (pending || []).length, ' 项')

  // 两笔 11 月账单只在基准当月核对，跨月后不误报
  if (nowYear === 2026 && nowMonth === 11) {
    const list = Array.isArray(repayments) ? repayments : []
    const hit = (date, amount) => list.some(
      (r) => String(r.due_date) === date && close(r.amount, amount)
    )
    push('11.15 手机分期账单', 1,
      hit(BASELINE_EXPECTED.installment.date, BASELINE_EXPECTED.installment.amount) ? 1 : 0, ' 笔')
    push('11.25 白条账单', 1,
      hit(BASELINE_EXPECTED.whiteBar.date, BASELINE_EXPECTED.whiteBar.amount) ? 1 : 0, ' 笔')
  }
  return { checked, diffs, aligned: diffs.length === 0 }
}
