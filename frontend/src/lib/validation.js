// ============================================================
// 统一数据校验与金额精度
// 所有写库路径必须先过这里，避免脏数据进入业务表。
// 原则：宁可明确拒绝，也不静默截断或自动纠错——截断等于悄悄改掉用户的数据。
// ============================================================
import { isValidISODate } from './date'

// 金额一律保留两位，杜绝 0.1+0.2 之类的浮点漂移累积
export function round2(value) {
  const n = Number(value)
  return Number.isFinite(n) ? Number(n.toFixed(2)) : 0
}

function positiveMoney(value, label) {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return { ok: false, error: `${label}须为大于 0 的数字` }
  if (n > 1e9) return { ok: false, error: `${label}超出合理范围` }
  return { ok: true, value: round2(n) }
}

function nonNegativeMoney(value, label) {
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0 || n > 1e9) return { ok: false, error: `${label}须为非负数字` }
  return { ok: true, value: round2(n) }
}

// 交易流水（AI 记账与手动记账共用）
export function validateTransaction(input) {
  const date = String(input?.txn_date || '').trim()
  if (!isValidISODate(date)) return { ok: false, error: '日期须为 YYYY-MM-DD 格式且真实存在' }

  const direction = String(input?.direction || '')
  if (direction !== 'income' && direction !== 'expense') {
    return { ok: false, error: '收支方向只能是收入或支出' }
  }

  const category = String(input?.category || '').trim()
  if (!category) return { ok: false, error: '分类不能为空' }
  if (category.length > 40) return { ok: false, error: '分类最多 40 个字' }

  const amount = positiveMoney(input?.amount, '金额')
  if (!amount.ok) return amount

  const rawNote = input?.note == null ? '' : String(input.note).trim()
  if (rawNote.length > 200) return { ok: false, error: '备注最多 200 个字' }

  return {
    ok: true,
    value: {
      txn_date: date,
      direction,
      category,
      amount: amount.value,
      note: rawNote || null,
      source: input?.source === 'ai' ? 'ai' : 'manual'
    }
  }
}

// 基础档案
export function validateProfile(input) {
  const payDay = Number(input?.pay_day)
  if (!Number.isInteger(payDay) || payDay < 1 || payDay > 31) {
    return { ok: false, error: '发薪日须为 1-31 的整数' }
  }
  const threshold = Number(input?.tax_threshold)
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1e7) {
    return { ok: false, error: '个税起征点不合法' }
  }
  const hireDate = input?.hire_date || null
  if (hireDate && !isValidISODate(hireDate)) return { ok: false, error: '入职日期格式不正确' }
  const city = String(input?.city || '').trim()
  if (!city) return { ok: false, error: '城市不能为空' }
  if (city.length > 60) return { ok: false, error: '城市最多 60 个字' }
  return {
    ok: true,
    value: { city, hire_date: hireDate, pay_day: payDay, tax_threshold: round2(threshold) }
  }
}

// 薪资与社保基数（四个基数必须是非负数字）
export function validateSalary(input) {
  const keys = ['pre_tax_salary', 'sb_base_pension', 'sb_base_medical', 'sb_base_unemploy', 'sb_base_fund']
  const value = { phase: 'regular' }
  for (const k of keys) {
    const checked = nonNegativeMoney(input?.[k], '薪资或社保基数')
    if (!checked.ok) return checked
    value[k] = checked.value
  }
  return { ok: true, value }
}

// 还款事件状态（与 repayment_event.status 的数据库 check 约束同款）
const REPAYMENT_STATUS = ['pending', 'reminding', 'paid', 'overdue']

// 单独校验状态，供 setRepaymentStatus 这类「只改状态」的写操作复用
export function validateRepaymentStatus(status) {
  const s = String(status || '')
  if (!REPAYMENT_STATUS.includes(s)) {
    return { ok: false, error: '还款状态只能是 待还款 / 已提醒 / 已还清 / 已逾期' }
  }
  return { ok: true, value: s }
}

// 还款事件
export function validateRepayment(input) {
  const due = String(input?.due_date || '')
  if (!isValidISODate(due)) return { ok: false, error: '还款日期不正确' }
  const amount = positiveMoney(input?.amount, '还款金额')
  if (!amount.ok) return amount
  const value = { due_date: due, amount: amount.value }
  // status 可选：新增还款不传时由数据库默认 pending；传入则严格校验枚举
  if (input?.status != null && input?.status !== '') {
    const st = validateRepaymentStatus(input.status)
    if (!st.ok) return st
    value.status = st.value
  }
  return { ok: true, value }
}

// 月固定开支
export function validateExpense(input) {
  const name = String(input?.name || '').trim()
  if (!name) return { ok: false, error: '开支名称不能为空' }
  if (name.length > 40) return { ok: false, error: '开支名称最多 40 个字' }
  const day = Number(input?.deduct_day)
  if (!Number.isInteger(day) || day < 1 || day > 31) {
    return { ok: false, error: '扣款日须为 1-31 的整数' }
  }
  const amount = nonNegativeMoney(input?.monthly_amount, '月金额')
  if (!amount.ok) return amount
  return { ok: true, value: { name, deduct_day: day, monthly_amount: amount.value } }
}

// 待收收入
// 到账（received）必须走 Ledger 的「写收入流水 + 改状态」事务补偿，
// 这里只允许未到账 / 审核中 / 已作废，避免状态与流水对不上。
const PENDING_WRITABLE_STATUS = ['unreceived', 'reviewing', 'void']

export function validatePendingIncome(input) {
  const type = String(input?.type || '').trim()
  if (!type) return { ok: false, error: '待收项目不能为空' }
  if (type.length > 60) return { ok: false, error: '待收项目最多 60 个字' }
  const amount = nonNegativeMoney(input?.est_amount, '预估金额')
  if (!amount.ok) return amount
  const condition = input?.condition == null ? '' : String(input.condition).trim()
  if (condition.length > 200) return { ok: false, error: '到账条件最多 200 个字' }
  const rawStatus = input?.status == null || input?.status === '' ? 'unreceived' : String(input.status)
  if (rawStatus === 'received') {
    return { ok: false, error: '「已到账」不能在此直接设置：请到台账使用「到账」操作，同步生成收入流水' }
  }
  if (!PENDING_WRITABLE_STATUS.includes(rawStatus)) {
    return { ok: false, error: '待收状态只能是 未到账 / 审核中 / 已作废' }
  }
  return {
    ok: true,
    value: {
      type,
      est_amount: amount.value,
      status: rawStatus,
      condition: condition || null
    }
  }
}

// 负债清单（liability 表）
const LIABILITY_TYPES = ['installment', 'white_bar', 'monthly_fixed']
const LIABILITY_STATUS = ['normal', 'deferred', 'cleared', 'overdue']

export function validateLiability(input) {
  const type = String(input?.type || '')
  if (!LIABILITY_TYPES.includes(type)) return { ok: false, error: '负债类型不合法' }
  const status = String(input?.status || 'normal')
  if (!LIABILITY_STATUS.includes(status)) return { ok: false, error: '负债状态不合法' }

  const check = (key, label) => nonNegativeMoney(input?.[key], label)
  const total = check('total', '负债总额')
  if (!total.ok) return total
  const paid = check('paid', '已还金额')
  if (!paid.ok) return paid
  const remaining = check('remaining_principal', '剩余本金')
  if (!remaining.ok) return remaining
  const fee = check('fee', '手续费')
  if (!fee.ok) return fee

  const nextDate = input?.next_repay_date || null
  if (nextDate && !isValidISODate(nextDate)) return { ok: false, error: '下次还款日期不正确' }
  if (paid.value > total.value) return { ok: false, error: '已还金额不能大于负债总额' }
  if (total.value > 0 && remaining.value > total.value) {
    return { ok: false, error: '剩余本金不能大于负债总额' }
  }

  return {
    ok: true,
    value: {
      type,
      total: total.value,
      paid: paid.value,
      remaining_principal: remaining.value,
      fee: fee.value,
      next_repay_date: nextDate,
      status
    }
  }
}

// ============================================================
// 编辑（partial update）校验
// 只校验并输出 patch 里出现的白名单字段，未知字段一律忽略，绝不写库；
// 金额一律过 round2。编辑动作与新增动作共用同一套金额 / 日期口径。
// ============================================================

// 月固定开支编辑：金额必须 > 0、扣款日 1~31、名称非空
export function validateExpensePatch(patch) {
  const input = patch || {}
  const value = {}
  if ('name' in input) {
    const name = String(input.name ?? '').trim()
    if (!name) return { ok: false, error: '开支名称不能为空' }
    if (name.length > 40) return { ok: false, error: '开支名称最多 40 个字' }
    value.name = name
  }
  if ('deduct_day' in input) {
    const day = Number(input.deduct_day)
    if (!Number.isInteger(day) || day < 1 || day > 31) {
      return { ok: false, error: '扣款日须为 1-31 的整数' }
    }
    value.deduct_day = day
  }
  if ('monthly_amount' in input) {
    const amount = positiveMoney(input.monthly_amount, '月金额')
    if (!amount.ok) return amount
    value.monthly_amount = amount.value
  }
  if (!Object.keys(value).length) return { ok: false, error: '没有可更新的开支字段' }
  return { ok: true, value }
}

// 负债编辑：类型 / 状态走枚举，总额必须 > 0，日期必须是真实存在的 YYYY-MM-DD。
// paid / remaining_principal / fee 沿用 validateLiability 的非负口径：
// 已结清时剩余本金为 0、无手续费时 fee 为 0 都是合法业务状态，不能一刀切要求 > 0。
// current 为现有行，用来在合并后校验「已还 ≤ 总额」「剩余本金 ≤ 总额」，
// 避免只改其中一个字段时绕过跨字段约束。
export function validateLiabilityPatch(patch, current = {}) {
  const input = patch || {}
  const value = {}
  if ('type' in input) {
    const type = String(input.type || '')
    if (!LIABILITY_TYPES.includes(type)) return { ok: false, error: '负债类型不合法' }
    value.type = type
  }
  if ('status' in input) {
    const status = String(input.status || '')
    if (!LIABILITY_STATUS.includes(status)) return { ok: false, error: '负债状态不合法' }
    value.status = status
  }
  if ('total' in input) {
    const total = positiveMoney(input.total, '负债总额')
    if (!total.ok) return total
    value.total = total.value
  }
  for (const [key, label] of [
    ['paid', '已还金额'],
    ['remaining_principal', '剩余本金'],
    ['fee', '手续费']
  ]) {
    if (key in input) {
      const checked = nonNegativeMoney(input[key], label)
      if (!checked.ok) return checked
      value[key] = checked.value
    }
  }
  if ('next_repay_date' in input) {
    const nextDate = input.next_repay_date || null
    if (nextDate && !isValidISODate(nextDate)) return { ok: false, error: '下次还款日期不正确' }
    value.next_repay_date = nextDate
  }
  if (!Object.keys(value).length) return { ok: false, error: '没有可更新的负债字段' }

  const mergedTotal = Number(value.total ?? current?.total)
  const mergedPaid = Number(value.paid ?? current?.paid)
  const mergedRemaining = Number(value.remaining_principal ?? current?.remaining_principal)
  if (Number.isFinite(mergedTotal) && mergedTotal > 0) {
    if (Number.isFinite(mergedPaid) && mergedPaid > mergedTotal) {
      return { ok: false, error: '已还金额不能大于负债总额' }
    }
    if (Number.isFinite(mergedRemaining) && mergedRemaining > mergedTotal) {
      return { ok: false, error: '剩余本金不能大于负债总额' }
    }
  }
  return { ok: true, value }
}

// 年内历史薪资（个税累计预扣校准），仅存本机
export function validateSalaryYtd(list) {
  if (!Array.isArray(list)) return { ok: false, error: '历史薪资格式不正确' }
  const seen = new Set()
  const value = []
  for (const row of list) {
    const month = Number(row?.month)
    if (!Number.isInteger(month) || month < 1 || month > 12 || seen.has(month)) {
      return { ok: false, error: `月份不合法或重复：${row?.month}` }
    }
    const preTax = Number(row?.preTax)
    const insurance = Number(row?.insuranceTotal)
    if (!Number.isFinite(preTax) || preTax < 0 || !Number.isFinite(insurance) || insurance < 0) {
      return { ok: false, error: `${month} 月的薪资或社保金额不合法` }
    }
    seen.add(month)
    value.push({ month, preTax: round2(preTax), insuranceTotal: round2(insurance) })
  }
  return { ok: true, value: value.sort((a, b) => a.month - b.month) }
}
