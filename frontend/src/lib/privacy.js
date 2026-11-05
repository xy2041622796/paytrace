// ============================================================
// PII 脱敏偏好：金额打码开关
// 复用 prefs.js 的账号隔离命名空间；打码状态在内存缓存，
// 避免 formatMoney 在模板 v-for 中每次调用都同步读 localStorage。
// 默认关闭：formatMoney 行为保持原样，verify.mjs 的断言不受影响。
// ============================================================
import { readPref, writePref, getPrefScope } from './prefs'

let cache = null // { scope, value }，scope 变化（切换账号）自动失效

// 跨标签页 / 退出登录时由调用方显式失效
export function invalidatePrivacyMask() {
  cache = null
}

export function readPrivacyMask() {
  const currentScope = getPrefScope()
  if (cache && cache.scope === currentScope) return cache.value
  let value = false
  try {
    value = readPref('privacyMask', false) === true
  } catch {
    value = false
  }
  cache = { scope: currentScope, value }
  return value
}

export function writePrivacyMask(value) {
  const next = value === true
  cache = { scope: getPrefScope(), value: next }
  writePref('privacyMask', next)
}

export function isPrivacyOn() {
  return readPrivacyMask()
}
