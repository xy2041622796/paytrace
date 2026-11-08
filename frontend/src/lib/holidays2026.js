// ============================================================
// 2026 年法定节假日 + 调休日历（本地静态表，MVP 用）
// 来源：国务院办公厅《关于2026年部分节假日安排的通知》（国办发明电〔2025〕7号，2025-11-04 发布）
// 公开信息，已在 2026-11-03 经 WebSearch 核验。
// 生产版应由 Supabase holiday_calendar 表提供（见 PRD RK-06，避免硬编码漂移）。
// ============================================================

// 法定节假日（放假日 → 休息）
export const HOLIDAY_LEGAL_2026 = new Set([
  // 元旦 1/1-1/3
  '2026-01-01', '2026-01-02', '2026-01-03',
  // 春节 2/15-2/23（共9天）
  '2026-02-15', '2026-02-16', '2026-02-17', '2026-02-18', '2026-02-19',
  '2026-02-20', '2026-02-21', '2026-02-22', '2026-02-23',
  // 清明节 4/4-4/6
  '2026-04-04', '2026-04-05', '2026-04-06',
  // 劳动节 5/1-5/5（共5天）
  '2026-05-01', '2026-05-02', '2026-05-03', '2026-05-04', '2026-05-05',
  // 端午节 6/19-6/21
  '2026-06-19', '2026-06-20', '2026-06-21',
  // 中秋节 9/25-9/27
  '2026-09-25', '2026-09-26', '2026-09-27',
  // 国庆节 10/1-10/7（共7天）
  '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05',
  '2026-10-06', '2026-10-07'
])

// 调休补班日（原休息日被安排工作 → 按工作日处理）
export const HOLIDAY_MAKEUP_2026 = new Set([
  '2026-01-04', // 周日补班
  '2026-02-14', // 周六补班
  '2026-02-28', // 周六补班
  '2026-05-09', // 周六补班
  '2026-09-20', // 周日补班
  '2026-10-10'  // 周六补班
])

// 2027 仅元旦（1/1 必放）保守内置；2027 其余安排未发布，按双休兜底（见 RK-06）
export const HOLIDAY_LEGAL_EXTRA = new Set(['2027-01-01'])

// ------------------------------------------------------------
// 动态日历覆盖（FR-15）：生产环境由 Supabase holiday_calendar 表年度维护。
// 表里有记录时优先用表判定，未覆盖的日期回落本地静态表；表为空则完全用静态表。
// 这样运营补录 2027+ 数据无需发版，也不改变既有静态断言的行为。
// ------------------------------------------------------------
let dynamicCalendar = null

export function setHolidayCalendar(rows) {
  const list = Array.isArray(rows) ? rows : []
  if (!list.length) {
    dynamicCalendar = null
    return
  }
  const map = new Map()
  for (const r of list) {
    const d = String(r?.holiday_date || '').slice(0, 10)
    if (!d) continue
    const t = String(r?.day_type || '')
    map.set(d, t === 'makeup_workday' ? 'makeup'
      : (t === 'legal_holiday' || t === 'rest') ? 'legal' : 'workday')
  }
  dynamicCalendar = map.size ? map : null
}

export function getHolidayCalendarInfo() {
  return { loaded: !!dynamicCalendar, size: dynamicCalendar ? dynamicCalendar.size : 0 }
}

// 日历分类：返回 'legal'(法定节假日) | 'makeup'(调休补班) | 'weekend'(周六日) | 'workday'(普通工作日)
export function classifyDay(dateStr) {
  const dyn = dynamicCalendar?.get(dateStr)
  if (dyn) return dyn
  if (HOLIDAY_LEGAL_2026.has(dateStr) || HOLIDAY_LEGAL_EXTRA.has(dateStr)) return 'legal'
  if (HOLIDAY_MAKEUP_2026.has(dateStr)) return 'makeup'
  const d = new Date(dateStr + 'T00:00:00')
  const dow = d.getDay() // 0=周日 6=周六
  return dow === 0 || dow === 6 ? 'weekend' : 'workday'
}

export function isRestDay(dateStr) {
  const t = classifyDay(dateStr)
  return t === 'legal' || t === 'weekend'
}

function toStr(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// 原「发薪日 / 还款日遇休调整」实现，现已停用：
// 工资按每月固定日当天到账，还款按账单日当天扣款，两者都不因周末或节假日顺延。
// 保留函数仅供未来「非资金类日程」复用，资金流引擎不再调用它。
export function adjustDate(dateStr, rule) {
  if (rule === 'keep') return dateStr
  let d = new Date(dateStr + 'T00:00:00')
  if (rule === 'advance') {
    while (isRestDay(toStr(d))) d.setDate(d.getDate() - 1)
  } else {
    while (isRestDay(toStr(d))) d.setDate(d.getDate() + 1)
  }
  return toStr(d)
}
