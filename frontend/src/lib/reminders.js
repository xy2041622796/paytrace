// ============================================================
// 站内还款提醒：3 天 / 1 天 / 当天 / 逾期分级 + 已读持久化
// 按账号隔离（复用 prefs），跨页面共享；状态机中间态 reminding
// 由 syncRepaymentStatuses 在档案加载后按日期自动流转。
// ============================================================
import { readPref, writePref } from './prefs'
import { supabase } from './supabase'

const READ_KEY = 'reminderReads'

export function dayDiff(dateStr, todayISO) {
  const a = new Date(`${dateStr}T00:00:00`).getTime()
  const b = new Date(`${todayISO}T00:00:00`).getTime()
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null
  return Math.round((a - b) / 86400000)
}

export function reminderLevel(days) {
  if (days == null) return 'none'
  if (days < 0) return 'overdue'
  if (days === 0) return 'today'
  if (days === 1) return 'd1'
  if (days <= 3) return 'd3'
  return 'none'
}

export const REMINDER_LEVEL_LABEL = {
  overdue: '已逾期',
  today: '今天到期',
  d1: '明天到期',
  d3: '3 天内到期'
}

// 构造需要提醒的账单（未标记已还、未作废），按紧急度排序
export function buildReminders(repayments = [], todayISO) {
  return (repayments || [])
    .filter((r) => r.status !== 'paid' && r.status !== 'void' && r.due_date)
    .map((r) => {
      const days = dayDiff(r.due_date, todayISO)
      return { ...r, days, level: reminderLevel(days) }
    })
    .filter((r) => r.level !== 'none')
    .sort((a, b) => a.days - b.days)
}

export function readReminderReads() {
  const v = readPref(READ_KEY, {})
  return v && typeof v === 'object' ? v : {}
}

// 去重键含到期日与级别：日期或紧急度变化后应重新提醒
export function reminderKey(r) {
  return `${r.id || r.due_date}:${r.due_date}:${r.level}`
}

export function markReminderRead(key) {
  const map = readReminderReads()
  map[key] = Date.now()
  writePref(READ_KEY, map)
}

export function isReminderRead(key) {
  return !!readReminderReads()[key]
}

// 状态机自动流转：仅接管 pending / reminding，用户手动标记的
// paid / overdue 不被覆盖。逐条写、单条失败不影响其它，也不抛给调用方。
export async function syncRepaymentStatuses(rows = [], todayISO) {
  const updates = []
  for (const r of rows) {
    if (!r?.id || !r.due_date) continue
    if (r.status !== 'pending' && r.status !== 'reminding') continue
    const days = dayDiff(r.due_date, todayISO)
    if (days == null) continue
    const next = days < 0 ? 'overdue' : (days <= 3 ? 'reminding' : 'pending')
    if (r.status !== next) updates.push({ id: r.id, status: next })
  }
  if (!updates.length) return { changed: 0, updates }
  let changed = 0
  for (const u of updates) {
    try {
      const { error } = await supabase.from('repayment_event')
        .update({ status: u.status }).eq('id', u.id)
      if (!error) changed++
    } catch {
      // 单条失败不影响其它行
    }
  }
  return { changed, updates }
}
