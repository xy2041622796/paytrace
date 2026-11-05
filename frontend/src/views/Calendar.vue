<template>
  <div class="cal">
    <h2 class="page-title">现金流日历</h2>
    <p class="muted">
      按档案推演的逐日余额 · 发薪日与还款日已标注 ·
      点任意一天看当天明细
    </p>
    <div class="cal-note muted">
      <span>{{ spreadHint }}</span>
      <span v-if="monthProjection.rolled">
        本月期初 {{ formatMoney(monthProjection.startBalance) }}，由当前月逐月滚动得出，与仪表盘前瞻一致
      </span>
      <span v-else class="note-warn">历史月份未接入实际流水，此处仅按档案推演，不作为真实结余</span>
      <span v-if="calendarIncomplete" class="note-warn">该年节假日数据尚未补全，日历属性按双休兜底</span>
    </div>

    <div v-if="loading" class="muted">正在加载档案…</div>
    <div v-else class="cal-body">
      <!-- 月份切换 + 本月心情 -->
      <div class="cal-head">
        <div class="cal-nav">
          <n-button size="small" quaternary @click="prevMonth">‹ 上月</n-button>
          <b class="cal-title">{{ viewYear }} 年 {{ viewMonth }} 月</b>
          <n-button size="small" quaternary @click="nextMonth">下月 ›</n-button>
          <n-button v-if="!isCurrentMonth" size="small" tertiary @click="goToday">回到本月</n-button>
        </div>
        <div class="cal-mood" :class="'m-' + mood.level">
          <span class="mood-dot" />
          <span>本月{{ mood.text }}</span>
          <span class="mood-sub">月末预计 {{ formatMoney(cf.monthEnd) }}</span>
        </div>
      </div>

      <!-- 星期表头（周一为起始，索引与 firstDow 的「周一为 0」严格对齐） -->
      <div class="cal-grid cal-week">
        <div v-for="(w, i) in weekLabels" :key="i" class="cal-cell cal-weekname">{{ w }}</div>
      </div>

      <!-- 日期格子 -->
      <div class="cal-grid">
        <div
          v-for="(cell, i) in cells"
          :key="i"
          class="cal-cell"
          :class="cellClass(cell)"
          :style="{ '--i': i }"
          @click="cell && selectDay(cell.day)"
        >
          <template v-if="cell">
            <div class="cal-daynum">
              {{ cell.day }}
              <span
                v-if="cell.dayType !== 'workday'"
                class="daytype"
                :class="'dt-' + cell.dayType"
                :title="dayTypeTitle[cell.dayType]"
              >{{ dayTypeLabel[cell.dayType] }}</span>
              <span v-if="cell.day === todayDay && isCurrentMonth" class="today-pill">今</span>
            </div>
            <div class="cal-balance">{{ formatMoney(cell.balance, false) }}</div>
            <div class="cal-marks">
              <span v-if="cell.isPay" class="mark mark-pay" title="发薪到账">薪</span>
              <span v-if="cell.isRepay" class="mark mark-rep" title="还款扣款">还</span>
            </div>
          </template>
        </div>
      </div>

      <!-- 当日明细 -->
      <div class="card day-detail">
        <div class="dd-head">
          <b>{{ selectedLabel }}</b>
          <span class="muted">{{ dayBalanceText }}</span>
        </div>
        <div v-if="selectedEvents.length" class="dd-list">
          <div
            v-for="(e, i) in selectedEvents"
            :key="i"
            class="dd-item"
            :class="'ev-' + e.type"
            :style="{ '--i': i }"
          >
            <span class="dd-tag">{{ evLabel[e.type] || '其他' }}</span>
            <span class="dd-name">{{ e.label }}</span>
            <b class="dd-amt" :class="e.amount >= 0 ? 'text-success' : 'text-danger'">
              {{ e.amount >= 0 ? '+' : '' }}{{ formatMoney(e.amount) }}
            </b>
          </div>
        </div>
        <div v-else class="muted dd-empty">这天没有收支记录（仅日常零花未记账）。</div>
      </div>

      <div class="legend muted">
        <span><i class="lg lg-pay" /> 发薪到账</span>
        <span><i class="lg lg-rep" /> 还款扣款</span>
        <span><i class="lg lg-ok" /> 余额充足</span>
        <span><i class="lg lg-low" /> 偏紧</span>
        <span><i class="lg lg-neg" /> 转负</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useAuthStore } from '../stores/auth'
import { useAppStore } from '../stores/app'
import { buildMonthProjection } from '../composables/useProjection'
import { todayISO } from '../lib/date'
import {
  readStartBalance, readRecurringRepayment, readExpenseSpreadMode
} from '../lib/prefs'
import { formatMoney } from '../lib/labels'
import { classifyDay } from '../lib/holidays2026'
import { SAFETY_LINE } from '../lib/constants'

const auth = useAuthStore()
const app = useAppStore()
const loading = ref(true)

const today = todayISO()
const todayParts = today.split('-').map(Number)
const todayYear = todayParts[0]
const todayMonth = todayParts[1]
const todayDay = todayParts[2]

const viewYear = ref(todayYear)
const viewMonth = ref(todayMonth)
const selectedDay = ref(todayDay)

// 周一为第 0 列，与下方 firstDow = (getDay()+6)%7 严格一一对应
const weekLabels = ['一', '二', '三', '四', '五', '六', '日']
const evLabel = { pay: '发薪', expense: '支出', repay: '还款' }
const dayTypeLabel = { legal: '假', makeup: '补', weekend: '休', workday: '' }
const dayTypeTitle = {
  legal: '法定节假日', makeup: '调休补班日', weekend: '周末休息日', workday: '工作日'
}

// 跨月推演：从当前月滚动到所选月份，期初余额与仪表盘「未来 N 个月前瞻」同源，
// 避免切月后两页相差数百元。偏好变化（期初余额 / 月供 / 分摊口径）即时重算。
const prefRevision = ref(0)
const onPrefChange = () => { prefRevision.value++ }
const monthProjection = computed(() => {
  void prefRevision.value
  return buildMonthProjection({
    app,
    startBalance: readStartBalance(),
    recurringRepayment: readRecurringRepayment(),
    baseYear: todayYear,
    baseMonth: todayMonth,
    year: viewYear.value,
    month: viewMonth.value
  })
})
const cf = computed(() => monthProjection.value.projection.cf)
const spreadHint = computed(() => {
  void prefRevision.value
  return readExpenseSpreadMode() === 'daily'
    ? '月固定开支按当月天数均摊到每天（全月合计不变），日度余额更贴近真实'
    : '月固定开支全部计入各自扣费日当天'
})
const calendarIncomplete = computed(() => viewYear.value > 2026)

// 事件按天归类
const eventsByDay = computed(() => {
  const map = {}
  cf.value.events.forEach((e) => {
    (map[e.day] = map[e.day] || []).push(e)
  })
  return map
})

// 当月每日单元格
const cells = computed(() => {
  const y = viewYear.value
  const m = viewMonth.value
  const daysInMonth = new Date(y, m, 0).getDate()
  const firstDow = (new Date(y, m - 1, 1).getDay() + 6) % 7 // 周一为 0
  const payDay = cf.value.effPayDay
  const repayDays = new Set(
    cf.value.events.filter((e) => e.type === 'repay').map((e) => e.day)
  )
  const out = []
  for (let i = 0; i < firstDow; i++) out.push(null)
  const ym = `${y}-${String(m).padStart(2, '0')}`
  for (let d = 1; d <= daysInMonth; d++) {
    out.push({
      day: d,
      balance: (cf.value.daily.find((x) => x.day === d) || {}).balance ?? 0,
      dayType: classifyDay(`${ym}-${String(d).padStart(2, '0')}`),
      isPay: d === payDay,
      isRepay: repayDays.has(d)
    })
  }
  return out
})

const isCurrentMonth = computed(
  () => viewYear.value === todayYear && viewMonth.value === todayMonth
)

// 本月心情
const mood = computed(() => {
  const end = cf.value.monthEnd
  const min = cf.value.monthMin
  if (end < 0) return { text: '告急', level: 'neg' }
  if (min < SAFETY_LINE) return { text: '吃紧', level: 'low' }
  if (end < 2000) return { text: '平稳', level: 'mid' }
  return { text: '宽裕', level: 'ok' }
})

const selectedEvents = computed(() => eventsByDay.value[selectedDay.value] || [])
const selectedLabel = computed(() =>
  `${viewYear.value} 年 ${viewMonth.value} 月 ${selectedDay.value} 日`
)
const dayBalanceText = computed(() => {
  const b = (cf.value.daily.find((x) => x.day === selectedDay.value) || {}).balance
  return b == null ? '' : `当天余额 ${formatMoney(b)}`
})

function cellClass(cell) {
  if (!cell) return 'cal-blank'
  const b = cell.balance
  const level = b < 0 ? 'neg' : b < SAFETY_LINE ? 'low' : b < 2000 ? 'mid' : 'ok'
  return [
    'cal-day',
    'h-' + level,
    { 'is-today': cell.day === todayDay && isCurrentMonth.value, 'is-selected': cell.day === selectedDay.value }
  ]
}

function selectDay(d) { selectedDay.value = d }

function prevMonth() {
  if (viewMonth.value === 1) { viewMonth.value = 12; viewYear.value-- } else viewMonth.value--
  selectedDay.value = 1
}
function nextMonth() {
  if (viewMonth.value === 12) { viewMonth.value = 1; viewYear.value++ } else viewMonth.value++
  selectedDay.value = 1
}
function goToday() {
  viewYear.value = todayYear
  viewMonth.value = todayMonth
  selectedDay.value = todayDay
}

onMounted(async () => {
  window.addEventListener('paytrace:pref-changed', onPrefChange)
  window.addEventListener('storage', onPrefChange)
  loading.value = true
  try {
    await auth.ensureReady()
    if (auth.userId) await app.load()
  } finally {
    loading.value = false
  }
})
onUnmounted(() => {
  window.removeEventListener('paytrace:pref-changed', onPrefChange)
  window.removeEventListener('storage', onPrefChange)
})
</script>

<style scoped>
.page-title { font-size: 20px; font-weight: 600; margin: 0 0 4px; }
.cal-note { display: flex; gap: 12px; flex-wrap: wrap; font-size: 12px; padding: 8px 10px; border: 1px solid var(--c-border); border-radius: 8px; background: var(--c-surface); margin-top: 10px; }
.note-warn { color: var(--c-warning-text); }
.daytype { font-size: 10px; line-height: 14px; padding: 0 4px; border-radius: 3px; color: var(--c-text-2); background: var(--c-hover); flex-shrink: 0; }
.dt-legal { color: var(--c-danger); background: rgba(239,68,68,.12); }
.dt-makeup { color: var(--c-warning-text); background: rgba(245,158,11,.16); }
.dt-weekend { color: var(--c-text-3); background: var(--c-hover); }
.cal-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin: 14px 0; }
.cal-nav { display: flex; align-items: center; gap: 10px; }
.cal-title { font-size: 16px; }
.cal-mood { display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 600; padding: 6px 12px; border-radius: 8px; }
.mood-dot { width: 10px; height: 10px; border-radius: 50%; }
.mood-sub { font-size: 12px; font-weight: 400; color: var(--c-text-3); }
.m-ok { color: var(--c-success); background: rgba(16,185,129,.12); }
.m-ok .mood-dot { background: var(--c-success); }
.m-mid { color: var(--c-primary); background: var(--c-primary-soft); }
.m-mid .mood-dot { background: var(--c-primary); }
.m-low { color: var(--c-warning-text); background: rgba(245,158,11,.16); }
.m-low .mood-dot { background: var(--c-warning); }
.m-neg { color: var(--c-danger); background: rgba(239,68,68,.12); }
.m-neg .mood-dot { background: var(--c-danger); }

.cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 8px; }
.cal-week { margin-bottom: 6px; }
.cal-weekname { text-align: center; font-size: 12px; color: var(--c-text-3); padding: 4px 0; }
.cal-cell { min-height: 64px; }
.cal-blank { min-height: 0; }
/* 切月时格子按 --i 依次浮现；backwards 保证 hover 位移不被动画终态锁死 */
.cal-grid .cal-cell {
  animation: cal-cell-in 320ms var(--ease-out) backwards;
  animation-delay: calc(var(--i, 0) * 10ms);
}
@keyframes cal-cell-in {
  from { opacity: 0; transform: translateY(6px) scale(.98); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}
.cal-day {
  border: 1px solid var(--c-border);
  border-radius: 8px;
  padding: 6px 8px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 3px;
  background: var(--c-surface);
  transition: transform var(--dur-fast) var(--ease-out),
              border-color var(--dur-fast) ease,
              box-shadow var(--dur-fast) ease,
              background-color var(--dur-base) ease;
}
.cal-day:hover { transform: translateY(-2px); border-color: var(--c-primary); }
.cal-daynum { font-size: 13px; font-weight: 600; display: flex; align-items: center; gap: 4px; }
.today-pill { background: var(--c-primary); color: #fff; font-size: 10px; padding: 0 4px; border-radius: 4px; }
.cal-balance { font-size: 12px; font-weight: 600; font-variant-numeric: tabular-nums; }
.cal-marks { display: flex; gap: 4px; margin-top: auto; }
.mark { font-size: 10px; line-height: 16px; width: 16px; height: 16px; text-align: center; border-radius: 4px; color: #fff; }
.mark-pay { background: var(--c-success); }
.mark-rep { background: var(--c-danger); }

/* 余额健康度着色 */
.h-ok .cal-balance { color: var(--c-success); }
.h-mid .cal-balance { color: var(--c-primary); }
.h-low .cal-balance { color: var(--c-warning-text); }
.h-low { background: rgba(245,158,11,.06); }
.h-neg .cal-balance { color: var(--c-danger); }
.h-neg { background: rgba(239,68,68,.08); border-color: rgba(239,68,68,.35); }
.is-selected { border-color: var(--c-primary); box-shadow: 0 0 0 2px var(--c-primary-soft); }

.day-detail { margin-top: 16px; }
.dd-head { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; margin-bottom: 10px; flex-wrap: wrap; }
.dd-list { display: flex; flex-direction: column; gap: 8px; }
.dd-item {
  display: flex; align-items: center; gap: 10px; font-size: 13px;
  animation: cal-item-in var(--dur-base) var(--ease-out) backwards;
  animation-delay: calc(var(--i, 0) * 45ms);
}
@keyframes cal-item-in {
  from { opacity: 0; transform: translateX(-6px); }
  to   { opacity: 1; transform: translateX(0); }
}
.dd-tag { font-size: 11px; padding: 2px 8px; border-radius: 4px; color: var(--c-text-2); background: var(--c-hover); flex-shrink: 0; }
.ev-pay .dd-tag { color: var(--c-success); background: rgba(16,185,129,.12); }
.ev-repay .dd-tag { color: var(--c-danger); background: rgba(239,68,68,.12); }
.dd-name { flex: 1; color: var(--c-text-2); }
.dd-amt { font-variant-numeric: tabular-nums; }
.dd-empty { padding: 6px 0; }

.legend { display: flex; gap: 16px; margin-top: 14px; font-size: 12px; flex-wrap: wrap; }
.legend .lg { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 5px; vertical-align: middle; }
.lg-pay { background: var(--c-success); }
.lg-rep { background: var(--c-danger); }
.lg-ok { background: var(--c-success); }
.lg-low { background: var(--c-warning); }
.lg-neg { background: var(--c-danger); }

@media (max-width: 768px) {
  .cal-cell { min-height: 52px; padding: 4px 5px; }
  .cal-grid { gap: 5px; }
  .cal-balance { font-size: 11px; }
  .cal-daynum { font-size: 12px; }
  .mark { width: 14px; height: 14px; line-height: 14px; font-size: 9px; }
}
</style>
