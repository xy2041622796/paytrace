// ============================================================
// AI 记账草稿清单
// 服务端结果 → 可编辑草稿；所有写入都必须经 collectWritable 过校验层。
// 纯函数，便于回归测试；不碰 localStorage、不碰网络。
// ============================================================
import { validateTransaction } from './validation'
import { todayISO } from './date'

const DIRECTION_MAP = { 收入: 'income', 支出: 'expense' }
let seq = 0
const uid = () => `draft-${Date.now()}-${++seq}`

export function makeBlankDraft() {
  return {
    id: uid(),
    txn_date: todayISO(),
    direction: 'expense',
    category: '',
    amount: null,
    note: '',
    source: 'manual',
    confidence: null,
    selected: true
  }
}

// 兼容四种服务端形态：数组 / {items:[]} / 单对象 / 空
export function normalizeAiResult(res) {
  const raw = res?.result
  const list = Array.isArray(raw) ? raw
    : Array.isArray(res?.items) ? res.items
      : Array.isArray(raw?.items) ? raw.items
        : raw ? [raw] : []
  return list.map((p) => ({
    id: uid(),
    txn_date: String(p?.date || p?.txn_date || todayISO()),
    direction: DIRECTION_MAP[p?.direction] || p?.direction || 'expense',
    category: String(p?.category || ''),
    amount: p?.amount == null ? null : Number(p.amount),
    note: String(p?.note || ''),
    source: 'ai',
    confidence: typeof p?.confidence === 'number' ? p.confidence : null,
    selected: true
  }))
}

export function isLowConfidence(item) {
  return item?.confidence != null && item.confidence < 0.7
}

export function validateDraft(draft) {
  return validateTransaction({
    txn_date: draft?.txn_date,
    direction: draft?.direction,
    category: draft?.category,
    amount: draft?.amount,
    note: draft?.note,
    source: draft?.source
  })
}

// onlyId 不为空时表示「只写这一笔」，忽略勾选状态；否则只写已勾选且合法的条目
export function collectWritable(drafts, onlyId = null) {
  const writable = []
  const invalid = []
  for (const d of (Array.isArray(drafts) ? drafts : [])) {
    if (onlyId && d.id !== onlyId) continue
    if (!onlyId && !d.selected) continue
    const checked = validateDraft(d)
    if (!checked.ok) {
      invalid.push({ id: d.id, error: checked.error })
      continue
    }
    writable.push({ id: d.id, value: checked.value })
  }
  return { writable, invalid }
}
