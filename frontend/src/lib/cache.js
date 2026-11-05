// ============================================================
// 本地缓存：按用户隔离 + 版本号 + 过期时间，读写全程异常兜底
// 只缓存低频变更的档案/配置；流水、待办等高频数据不缓存
// ============================================================
import { CACHE_VERSION } from './constants'

const PREFIX = 'paytrace:cache'

const buildKey = (uid, name) => `${PREFIX}:v${CACHE_VERSION}:${uid}:${name}`

export function readCache(uid, name, maxAge) {
  if (!uid) return null
  try {
    const raw = localStorage.getItem(buildKey(uid, name))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed.t !== 'number') return null
    if (Date.now() - parsed.t > maxAge) {
      localStorage.removeItem(buildKey(uid, name))
      return null
    }
    return parsed.v
  } catch {
    return null
  }
}

export function writeCache(uid, name, value) {
  if (!uid) return
  try {
    localStorage.setItem(
      buildKey(uid, name),
      JSON.stringify({ t: Date.now(), v: value })
    )
  } catch {
    // 隐私模式 / 配额不足：缓存降级为仅内存，不影响业务
  }
}

export function clearCache(uid) {
  if (!uid) return
  try {
    const prefix = `${PREFIX}:v${CACHE_VERSION}:${uid}:`
    Object.keys(localStorage)
      .filter((k) => k.startsWith(prefix))
      .forEach((k) => localStorage.removeItem(k))
  } catch {
    // noop
  }
}
