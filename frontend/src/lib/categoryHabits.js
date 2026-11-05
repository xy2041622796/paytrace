// ============================================================
// 分类习惯记忆（本机、按账号隔离、长期保留）
// 与 prefs 的「退出即清」不同：习惯是用户主动积累的资产，退出登录不清除。
// 只存分类词、计数与别名映射，不存金额/备注，不上传服务端。
// ============================================================
import { getPrefScope } from './prefs'
import { DEFAULT_CATEGORIES } from './aiDraft'

const KEY_PREFIX = 'paytrace:habits:'
const MAX_CUSTOM = 60
const MAX_ALIASES = 80
const MAX_CATEGORY_LEN = 24

function storage() {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

// key 里带 uid，换账号读不到别人的习惯；重新登录后 scope 恢复即可读回
function key() {
  return `${KEY_PREFIX}${getPrefScope() || 'anon'}:categories`
}

const empty = () => ({ counts: {}, aliases: {}, custom: [] })
const clean = (v) => String(v ?? '').trim().slice(0, MAX_CATEGORY_LEN)

export function getHabits() {
  const s = storage()
  if (!s) return empty()
  try {
    const raw = s.getItem(key())
    if (!raw) return empty()
    const parsed = JSON.parse(raw)
    return {
      counts: parsed && typeof parsed.counts === 'object' ? parsed.counts : {},
      aliases: parsed && typeof parsed.aliases === 'object' ? parsed.aliases : {},
      custom: Array.isArray(parsed?.custom) ? parsed.custom : []
    }
  } catch {
    return empty()
  }
}

function save(h) {
  const s = storage()
  if (!s) return
  try {
    s.setItem(key(), JSON.stringify(h))
  } catch {
    // 隐私模式 / 配额不足：仅本次会话不持久化，不阻断业务
  }
}

// 记一次使用：计数 +1，自定义分类自动收进清单
export function recordUsage(category) {
  const c = clean(category)
  if (!c) return
  const h = getHabits()
  h.counts[c] = (Number(h.counts[c]) || 0) + 1
  if (!DEFAULT_CATEGORIES.includes(c) && !h.custom.includes(c)) {
    h.custom.push(c)
    if (h.custom.length > MAX_CUSTOM) h.custom = h.custom.slice(-MAX_CUSTOM)
  }
  save(h)
}

// 用户把模型给的分类改成自己习惯的说法时，记下「原词 → 偏好分类」
export function recordAlias(original, chosen) {
  const from = clean(original)
  const to = clean(chosen)
  if (!from || !to || from === to) return
  const h = getHabits()
  h.aliases[from] = to
  h.counts[to] = (Number(h.counts[to]) || 0) + 1
  if (!DEFAULT_CATEGORIES.includes(to) && !h.custom.includes(to)) h.custom.push(to)
  const keys = Object.keys(h.aliases)
  if (keys.length > MAX_ALIASES) delete h.aliases[keys[0]]
  save(h)
}

// 从历史流水批量导入习惯（复用账本已有的查询结果，不发额外请求）
export function learnFromRows(rows) {
  const list = Array.isArray(rows) ? rows : []
  if (!list.length) return
  const h = getHabits()
  for (const r of list) {
    const c = clean(r?.category)
    if (!c) continue
    h.counts[c] = (Number(h.counts[c]) || 0) + 1
    if (!DEFAULT_CATEGORIES.includes(c) && !h.custom.includes(c)) h.custom.push(c)
  }
  if (h.custom.length > MAX_CUSTOM) h.custom = h.custom.slice(-MAX_CUSTOM)
  save(h)
}

// 传给模型的「你的常用分类」：用过的按频次优先，再用默认清单补齐
export function habitCategories(limit = 40) {
  const h = getHabits()
  const used = Object.keys(h.counts).sort((a, b) => (Number(h.counts[b]) || 0) - (Number(h.counts[a]) || 0))
  const out = []
  for (const c of [...used, ...h.custom, ...DEFAULT_CATEGORIES]) {
    const v = clean(c)
    if (v && !out.includes(v)) out.push(v)
    if (out.length >= limit) break
  }
  return out
}

export function habitOptions() {
  return { aliases: getHabits().aliases, categories: habitCategories() }
}

// 预留清除入口（当前未接 UI）
export function clearHabits() {
  const s = storage()
  if (!s) return
  try {
    s.removeItem(key())
  } catch {
    // noop
  }
}
