// ============================================================
// 月度对账匹配规则
// 真实记账常有分角差异，金额严格相等会把「已记的账」误报成「未匹配」。
// 同一容差同时用于「事件是否已入账」与「整体偏差是否吻合」，避免两处口径打架。
// ============================================================
import { round2 } from './validation'

export const DEFAULT_TOLERANCE = 1
const MAX_TOLERANCE = 1000

export function normalizeTolerance(value) {
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) return DEFAULT_TOLERANCE
  return round2(Math.min(n, MAX_TOLERANCE))
}

export function withinTolerance(a, b, tolerance = DEFAULT_TOLERANCE) {
  const left = Number(a)
  const right = Number(b)
  if (!Number.isFinite(left) || !Number.isFinite(right)) return false
  return Math.abs(round2(left - right)) <= normalizeTolerance(tolerance) + 1e-9
}

// events 来自现金流引擎（day / label / amount / type），txns 来自 transaction 表
export function findUnmatchedEvents(events, txns, yearMonth, tolerance = DEFAULT_TOLERANCE, limit = 6) {
  const pad = (n) => String(n).padStart(2, '0')
  const list = Array.isArray(events) ? events : []
  const records = Array.isArray(txns) ? txns : []
  const out = []
  for (const e of list) {
    if (e.type === 'pay') continue // 工资到账通常不单独记账，不进「未匹配」清单
    // 按日均摊的日常零花是推演估算，不是一笔真实账单，不逐笔要求用户对上
    if (e.spread) continue
    const date = `${yearMonth}-${pad(e.day)}`
    const amount = Math.abs(Number(e.amount))
    if (!Number.isFinite(amount)) continue
    const matched = records.some((t) =>
      String(t.txn_date) === date && withinTolerance(Math.abs(Number(t.amount)), amount, tolerance)
    )
    if (!matched) out.push({ date, label: e.label, amount: e.amount })
    if (out.length >= limit) break
  }
  return out
}
