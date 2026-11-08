// ============================================================
// 展示层中文映射：所有数据库枚举统一在这里转中文，界面不直接暴露英文
// ============================================================
import { isPrivacyOn } from './privacy'

export const PHASE_LABEL = {
  probation: '试用期',
  regular: '转正后'
}

export const DIRECTION_LABEL = {
  income: '收入',
  expense: '支出',
  收入: '收入',
  支出: '支出'
}

export const DAY_TYPE_LABEL = {
  workday: '工作日',
  weekend: '周末',
  legal: '法定节假日',
  makeup: '调休补班'
}

export const RISK_LEVEL_LABEL = {
  red: '高风险',
  orange: '需留意',
  yellow: '提前准备',
  info: '状态良好'
}

// PRD FR-14 对外的「高 / 中」两级语义；内部仍保留红/橙/黄/info 细分用于排序与着色
export const RISK_TIER_LABEL = {
  red: '高风险',
  orange: '中风险',
  yellow: '中风险',
  info: '提示'
}

export const SOURCE_LABEL = {
  manual: '手动录入',
  ai: '智能记账'
}

export const TODO_STATUS_LABEL = {
  open: '待办',
  done: '已完成'
}

export const PENDING_STATUS_LABEL = {
  unreceived: '未到账',
  reviewing: '审核中',
  received: '已到账',
  void: '已作废'
}

export const LIABILITY_TYPE_LABEL = {
  installment: '分期',
  white_bar: '白条',
  monthly_fixed: '月度固定'
}

export const LIABILITY_STATUS_LABEL = {
  normal: '正常',
  deferred: '已延期',
  cleared: '已结清',
  overdue: '已逾期'
}

export const REPAY_STATUS_LABEL = {
  pending: '待还款',
  reminding: '已提醒',
  paid: '已还清',
  overdue: '已逾期'
}

// 2026-11-15 / 2026-11-15T08:30:00Z / 11/15 → 11月15日
export function formatDateCN(value) {
  if (!value) return '—'
  const s = String(value)
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (iso) return `${Number(iso[2])}月${Number(iso[3])}日`
  const slash = s.split('/')
  if (slash.length === 2) return `${Number(slash[0])}月${Number(slash[1])}日`
  return s
}

// 时间戳 → 2026-11-04 20:43
// 强制亚洲上海时区（GMT+8）+ 24 小时制，不依赖本机时区设置（跨机器一致）
export function formatDateTimeCN(ts) {
  if (!ts) return '—'
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return '—'
  try {
    return new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false
    }).format(d).replace(/\//g, '-')
  } catch {
    const p = (n) => String(n).padStart(2, '0')
    return `${p(d.getFullYear())}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
  }
}

// 兼容旧调用名（部分页面仍引用）
export const formatTimeCN = formatDateTimeCN

// 星期中文（周日=0 … 周六=6）
export const WEEKDAY_LABEL = ['日', '一', '二', '三', '四', '五', '六']

// 金额：千分位 + 两位小数
// 金额打码开启时返回掩码，默认关闭（Node 环境无 localStorage 自动回退关闭）
export function formatMoney(value, withUnit = true) {
  if (isPrivacyOn()) return withUnit ? '•••• 元' : '••••'
  const n = Number(value)
  if (!Number.isFinite(n)) return withUnit ? '0.00 元' : '0.00'
  const s = n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return withUnit ? `${s} 元` : s
}

// 供返回 HTML 字符串的第三方渲染器（如 ECharts tooltip formatter）使用：
// Vue 插值本身会自动转义，但拼进 HTML 的动态片段必须显式转义。
const HTML_ESCAPE = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => HTML_ESCAPE[c])
}
