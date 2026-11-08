// ============================================================
// 轻量埋点：PRD 第十章 7 个事件
// 真实模式写 analytics_event 表（RLS 仅本人可见）；演示模式、表未迁移或
// 网络异常时降级到本机队列供「数据体检」查看，绝不阻塞业务流程、
// 绝不发往任何第三方。payload 只收标量并限长，避免敏感对象整包外带。
// ============================================================
import { supabase, isDemoMode } from './supabase'
import { readPref, writePref, getPrefScope } from './prefs'

export const TRACK_EVENTS = [
  'register_complete',
  'param_saved',
  'ai_note_created',
  'repayment_reminder_sent',
  'scenario_switched',
  'cashflow_negative_viewed',
  'holiday_adjusted'
]
const EVENT_SET = new Set(TRACK_EVENTS)
const LOCAL_KEY = 'analyticsEvents'
const MAX_LOCAL = 200

function readLocal() {
  const v = readPref(LOCAL_KEY, [])
  return Array.isArray(v) ? v : []
}

export function readLocalEvents() {
  return readLocal()
}

function appendLocal(row) {
  const list = readLocal()
  list.push(row)
  writePref(LOCAL_KEY, list.slice(-MAX_LOCAL))
}

function safePayload(input) {
  const out = {}
  if (!input || typeof input !== 'object') return out
  for (const [k, v] of Object.entries(input)) {
    if (v == null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      out[String(k).slice(0, 40)] = typeof v === 'string' ? v.slice(0, 200) : v
    }
  }
  return out
}

// 同一事件 + 同一去重键在一个会话内只上报一次，避免 computed 重算造成刷屏
const seen = new Set()
export async function trackEvent(name, payload = {}, dedupeKey = '') {
  if (!EVENT_SET.has(name)) return
  const key = `${name}:${dedupeKey || ''}`
  if (seen.has(key)) return
  seen.add(key)

  const row = {
    event: name,
    payload: safePayload(payload),
    at: new Date().toISOString()
  }
  if (!isDemoMode) {
    try {
      const uid = getPrefScope()
      if (uid) {
        const { error } = await supabase.from('analytics_event').insert({
          user_id: uid, event: row.event, payload: row.payload
        })
        if (error) throw error
        return
      }
    } catch {
      // 表未迁移 / 网络异常 / RLS 拒绝：降级本机，业务不受影响
    }
  }
  try { appendLocal(row) } catch { /* 隐私模式下仅本次会话生效 */ }
}

// 供测试或「换一个月重新观察」时重置去重集合
export function resetTrackDedupe() {
  seen.clear()
}
