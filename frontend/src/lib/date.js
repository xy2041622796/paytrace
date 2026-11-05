// ============================================================
// 本地时区日期工具
// 红线：禁止用 new Date(ts).toISOString().slice(0,10) 取日期。
//       toISOString 转 UTC，GMT+8 的本地 00:00 会变成前一天，导致落库日期错一天。
// ============================================================

const p2 = (n) => String(n).padStart(2, '0')

// 时间戳 / Date / 日期字符串 → 本地 YYYY-MM-DD
export function toLocalISODate(value) {
  if (value == null || value === '') return null
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`
}

// 严格校验 YYYY-MM-DD（含真实日期检查，拒绝 2026-02-30）
export function isValidISODate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const [y, m, d] = s.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d
}

// 今天（亚洲上海时区 GMT+8），返回 YYYY-MM-DD
// 不依赖本机时区：用 Intl 显式指定 Asia/Shanghai，出差/换机器结果一致
export function todayISO() {
  try {
    const s = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date())
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  } catch {
    // 老环境无 Intl 时区支持时退回本地
  }
  return toLocalISODate(new Date())
}

// 某月的首尾日期（用于精确查询当月数据，避免 limit 截断汇总）
export function monthRangeISO(year, month) {
  const last = new Date(year, month, 0).getDate()
  return { start: `${year}-${p2(month)}-01`, end: `${year}-${p2(month)}-${p2(last)}` }
}

// 本地日期字符串 → 本地 00:00 的时间戳（回显给日期选择器）
export function isoDateToTimestamp(s) {
  if (!isValidISODate(s)) return null
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d).getTime()
}
