// ============================================================
// 用户偏好持久化（按账号隔离，无 TTL，仅本机）
// 用于目标安全垫、年内历史薪资、每月固定还款、对账期初余额等
// 这些数据不适合放进 Supabase（要么是本机的试算参数，要么涉及历史工资条）
// 红线：不同账号必须读到各自的偏好；退出登录清理当前账号数据。
// ============================================================
import { todayISO, nowCN } from './date'

const PREFIX = 'paytrace:pref:'
const SCOPE_KEY = 'paytrace:pref-scope'

let scope = null
let scopeLoaded = false

function storage() {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

// 账号作用域只在首次读取 / 显式设置时碰 localStorage，
// formatMoney 等渲染热路径走内存缓存，不再产生同步 IO。
export function getPrefScope() {
  if (!scopeLoaded) {
    scopeLoaded = true
    try {
      scope = storage()?.getItem(SCOPE_KEY) || ''
    } catch {
      scope = ''
    }
  }
  return scope
}

export function setPrefScope(uid) {
  scope = uid || ''
  scopeLoaded = true
  try {
    storage()?.setItem(SCOPE_KEY, scope)
  } catch {
    // 隐私模式：仅本次会话生效
  }
}

const scopedKey = (key) => {
  const s = getPrefScope()
  return `${PREFIX}${s ? s + ':' : ''}${key}`
}
const legacyKey = (key) => PREFIX + key

function emitPrefChange(key) {
  if (typeof window === 'undefined' || typeof CustomEvent === 'undefined') return
  try {
    window.dispatchEvent(new CustomEvent('paytrace:pref-changed', { detail: { key } }))
  } catch {
    // 事件派发失败不影响写入结果
  }
}

export function readPref(key, fallback) {
  const s = storage()
  if (!s) return fallback
  const k = scopedKey(key)
  try {
    const raw = s.getItem(k)
    if (raw != null) {
      const parsed = JSON.parse(raw)
      return parsed == null ? fallback : parsed
    }
    // 旧版全局 key 一次性迁移到当前账号：升级不丢值，也终止跨账号共享
    const oldKey = legacyKey(key)
    if (k !== oldKey) {
      const old = s.getItem(oldKey)
      if (old != null) {
        const parsed = JSON.parse(old)
        try {
          s.setItem(k, old)
          s.removeItem(oldKey)
        } catch {
          // 配额不足时保留旧值，下次读取仍可拿到
        }
        return parsed == null ? fallback : parsed
      }
    }
    return fallback
  } catch {
    return fallback
  }
}

export function writePref(key, value) {
  const s = storage()
  if (!s) return
  try {
    s.setItem(scopedKey(key), JSON.stringify(value))
  } catch {
    // 隐私模式 / 配额不足：仅本次会话生效，不阻断业务
  }
  emitPrefChange(key)
}

// 退出登录时清掉当前账号的全部本机偏好（含年内真实薪资），不留给下一个账号
export function clearPrefs() {
  const s = storage()
  const prefix = scopedKey('')
  if (s) {
    try {
      Object.keys(s).filter((k) => k.startsWith(prefix)).forEach((k) => s.removeItem(k))
    } catch {
      // noop
    }
  }
  scope = ''
  scopeLoaded = true
  try {
    s?.setItem(SCOPE_KEY, '')
  } catch {
    // noop
  }
  emitPrefChange('*')
}

// 兼容早期散落的 localStorage key，避免升级后丢用户已填的值
export function migrateLegacy(legacyKeyName, prefKey, fallback) {
  try {
    const old = localStorage.getItem(legacyKeyName)
    if (old == null) return readPref(prefKey, fallback)
    const value = Number(old) || 0
    writePref(prefKey, value)
    localStorage.removeItem(legacyKeyName)
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

// ============================================================
// 当前真实余额 + 余额变动台账
// ------------------------------------------------------------
// 两者存在同一个 key、一次写入：保证「首页显示的余额」与「台账最新一条」
// 永远一致，绝不会出现「钱变了没记录」或「有记录钱没变」。
// 红线：
// 1. 金额一律以「分」为整数运算，杜绝 0.1 + 0.2 之类的浮点漂移。
// 2. 台账 append-only：只追加，不覆盖、不删除；首次记录为基线（from=null），
//    绝不编造一个「上一次余额」。
// 3. 每条含完整北京时间、变更前 / 后、差额、原因；差额恒等于 后 − 前。
// 4. 按账号隔离（复用 scopedKey），退出登录随其它本机偏好一起清理。
// ============================================================
const BALANCE_KEY = 'currentBalance'
const cents = (n) => Math.round(Number(n) * 100)
const yuan = (c) => c / 100

export function readCurrentBalance() {
  const v = readPref(BALANCE_KEY, null)
  if (!v || typeof v !== 'object') return { value: null, updatedAt: '', log: [] }
  const n = Number(v.value)
  return {
    value: Number.isFinite(n) ? yuan(cents(n)) : null,
    updatedAt: String(v.updatedAt || ''),
    log: Array.isArray(v.log) ? v.log : []
  }
}

// 写入余额并同步追加一条台账。options: { reason }
// 首次写入（或旧版本数据无台账）自动记为基线，from 为 null。
export function writeCurrentBalance(value, options = {}) {
  const n = Number(value)
  if (!Number.isFinite(n)) return   // 非法金额绝不落库
  const c = cents(n)
  const prev = readCurrentBalance()
  const log = prev.log.slice()
  const isBaseline = prev.value == null || log.length === 0
  const fromC = isBaseline ? null : cents(prev.value)
  const deltaC = fromC == null ? null : c - fromC
  const rec = {
    id: `${Date.now()}-${log.length}`,
    at: nowCN(),
    date: todayISO(),
    from: fromC == null ? null : yuan(fromC),
    to: yuan(c),
    delta: deltaC == null ? null : yuan(deltaC),
    reason: String(options.reason || '').trim().slice(0, 120) || '手动更新余额',
    kind: isBaseline ? 'baseline' : 'update'
  }
  log.push(rec)
  // value 与 log 一次写入，不可拆分，天然一致
  writePref(BALANCE_KEY, { value: yuan(c), updatedAt: todayISO(), log })
  return rec
}

export function readBalanceLog() {
  return readCurrentBalance().log
}

// 逐条核对：差额自洽、链条前后衔接、最新值等于当前显示值
export function verifyBalanceLog() {
  const { value, log } = readCurrentBalance()
  const chainOk = log.every((r, i) => {
    if (r.from == null) return i === 0
    return cents(r.from) === cents(log[i - 1].to) &&
      cents(r.delta) === cents(r.to) - cents(r.from)
  })
  const latest = log.length ? log[log.length - 1].to : null
  return {
    count: log.length,
    chainOk,
    consistent: value != null && latest != null && cents(value) === cents(latest),
    current: value,
    latest
  }
}
