// ============================================================
// PII 脱敏偏好：金额打码开关
// key 与 prefs.js 的 paytrace:pref: 命名空间一致，但独立实现，
// 保证 Node / 无 localStorage 环境（回归测试、SSR）不会抛错。
// 默认关闭：formatMoney 行为保持原样，verify.mjs 的断言不受影响。
// ============================================================
const KEY = 'paytrace:pref:privacyMask'

export function readPrivacyMask() {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw == null) return false
    return JSON.parse(raw) === true
  } catch {
    // Node 环境无 localStorage、隐私模式禁用存储、或内容损坏：一律视为关闭
    return false
  }
}

export function writePrivacyMask(value) {
  try {
    localStorage.setItem(KEY, JSON.stringify(value === true))
  } catch {
    // 隐私模式 / 配额不足：仅本次会话生效，不阻断业务，也不抛错
  }
}

export function isPrivacyOn() {
  return readPrivacyMask()
}
