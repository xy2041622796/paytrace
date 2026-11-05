// ============================================================
// 用户偏好持久化（无 TTL，仅本机、仅当前用户）
// 用于目标安全垫、年内历史薪资、每月固定还款、对账期初余额等
// 这些数据不适合放进 Supabase（要么是本机的试算参数，要么涉及历史工资条）
// ============================================================
const PREFIX = 'paytrace:pref:'

export function readPref(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (raw == null) return fallback
    const parsed = JSON.parse(raw)
    return parsed == null ? fallback : parsed
  } catch {
    return fallback
  }
}

export function writePref(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value))
    // 同页即时刷新推演；跨标签页另由 storage 事件处理
    window.dispatchEvent(new CustomEvent('paytrace:pref-changed', { detail: { key } }))
  } catch {
    // 隐私模式 / 配额不足：仅本次会话生效，不阻断业务
  }
}

// 兼容早期散落的 localStorage key，避免升级后丢用户已填的值
export function migrateLegacy(legacyKey, prefKey, fallback) {
  try {
    const old = localStorage.getItem(legacyKey)
    if (old == null) return readPref(prefKey, fallback)
    const value = Number(old) || 0
    writePref(prefKey, value)
    localStorage.removeItem(legacyKey)
    return value
  } catch {
    return readPref(prefKey, fallback)
  }
}

// 期初余额：仪表盘与月度对账必须共用同一个值，否则同一个月会出现两个预测基准。
// 兼容早期只在账本页落盘的 reconcileStart。
export function readStartBalance() {
  const cur = readPref('startBalance', null)
  if (cur != null) return Math.max(0, Number(cur) || 0)
  const legacy = readPref('reconcileStart', null)
  if (legacy != null) {
    const value = Math.max(0, Number(legacy) || 0)
    writePref('startBalance', value)
    return value
  }
  return 0
}

export function writeStartBalance(value) {
  writePref('startBalance', Math.max(0, Number(value) || 0))
}

// 月固定开支的日度口径：所有页面必须共用同一个值，否则日历与仪表盘会对不上。
// daily = 按当月天数均摊（餐饮等每天发生的开支）；deductDay = 全部计入扣费日当天。
export const EXPENSE_SPREAD_DAILY = 'daily'
export const EXPENSE_SPREAD_DEDUCT_DAY = 'deductDay'

export function readExpenseSpreadMode() {
  const v = readPref('expenseSpreadMode', EXPENSE_SPREAD_DAILY)
  return v === EXPENSE_SPREAD_DEDUCT_DAY ? v : EXPENSE_SPREAD_DAILY
}

export function writeExpenseSpreadMode(mode) {
  writePref(
    'expenseSpreadMode',
    mode === EXPENSE_SPREAD_DEDUCT_DAY ? EXPENSE_SPREAD_DEDUCT_DAY : EXPENSE_SPREAD_DAILY
  )
}

// 每月固定还款：仪表盘与日历必须读同一个偏好（含旧 key 兼容）
export function readRecurringRepayment() {
  return Number(migrateLegacy('paytrace:forecast-recurring', 'recurringRepayment', 0)) || 0
}
