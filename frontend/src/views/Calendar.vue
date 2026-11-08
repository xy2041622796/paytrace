<template>
  <div class="cal pt-page pt-bleed">
    <div v-if="loading" class="muted">正在加载档案…</div>
    <template v-else>
      <!-- 顶栏：左身份 + 中月份切换 + 右本月心情，与仪表盘的页身份刻意区分 -->
      <header class="cal-head-bar">
        <div class="cal-id">
          <span class="cal-eyebrow">概览 · 日历</span>
          <h1 class="cal-title-h">现金流日历</h1>
        </div>
        <div class="cal-nav">
          <n-button size="small" quaternary @click="prevMonth">‹ 上月</n-button>
          <b class="cal-title">{{ viewYear }} 年 {{ viewMonth }} 月</b>
          <n-button size="small" quaternary @click="nextMonth">下月 ›</n-button>
          <n-button v-if="!isCurrentMonth" size="small" tertiary @click="goToday">回到本月</n-button>
        </div>
        <div class="cal-mood" :class="'m-' + mood.level">
          <Mascot :level="mood.level" :size="34" />
          <span>本月{{ mood.text }}</span>
          <span class="mood-sub">月末预计 {{ formatMoney(cf.monthEnd) }}</span>
        </div>
      </header>

      <p class="cal-sub muted">这里算的是「每天结束时预计还剩多少钱」，不是你当天刷了多少钱。点任意一天，看这天到底会进账、扣掉哪几笔。</p>

      <!-- 读法说明：三条并排的 slim strip，不再用小标题 + 三卡 -->
      <div class="cal-readhint">
        <div class="rh-item"><b>格子里的数</b><span>当天结束时的预计余额</span></div>
        <div class="rh-item"><b>下面的 + / −</b><span>这天净变化（到账 − 扣款）</span></div>
        <div class="rh-item"><b>点某一天</b><span>逐笔列出「哪一笔、多少钱」</span></div>
      </div>

      <div class="cal-note muted">
        <span>{{ spreadHint }}</span>
        <span v-if="monthProjection.rolled">
          本月期初 {{ formatMoney(monthProjection.startBalance) }}，由当前月逐月滚动得出，与仪表盘前瞻一致
        </span>
        <span v-else class="note-warn">{{ isCurrentMonth ? '本月按档案推演并叠加已记流水；固定开支 / 还款为预算线，整体仍为推演值，不作为真实结余' : '历史月份按档案与已记流水共同推演，不作为真实结余' }}</span>
        <span v-if="calendarIncomplete" class="note-warn">该年节假日数据尚未补全，日历属性按双休兜底</span>
        <span v-if="holidayInfo.loaded">节假日按运营表判定（已加载 {{ holidayInfo.size }} 条）</span>
        <span>发薪 / 还款遇周末或法定节假日照发、不顺延（按账单日当天落点）</span>
      </div>

      <!-- 通栏布局：左为整月网格（突破 1240 收敛），右为常驻当日明细 -->
      <div class="cal-layout">
        <div class="cal-grid-wrap">
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
                <div class="cal-balance-row">
                  <span class="cal-balance-label">余额</span>
                  <b class="cal-balance">{{ formatMoney(cell.balance, false) }}</b>
                </div>
                <div class="cal-delta" :class="cell.delta > 0 ? 'd-up' : 'd-down'">
                  {{ cell.delta > 0 ? '+' : '' }}{{ formatMoney(cell.delta, false) }}
                  <span class="delta-word">今日</span>
                </div>
                <div class="cal-marks">
                  <span v-if="cell.isPay" class="mark mark-pay" title="发薪到账">薪</span>
                  <span v-if="cell.isRepay" class="mark mark-rep" title="还款扣款">还</span>
                </div>
              </template>
            </div>
          </div>

          <div class="pt-legend">
            <span class="pt-legend-item"><i class="pt-legend-dot pt-legend-dot--success" /> 发薪到账（余额增加）</span>
            <span class="pt-legend-item"><i class="pt-legend-dot pt-legend-dot--danger" /> 还款扣款（余额减少）</span>
            <span class="pt-legend-item"><i class="pt-legend-dot pt-legend-dot--success" /> 余额充足</span>
            <span class="pt-legend-item"><i class="pt-legend-dot pt-legend-dot--warning" /> 偏紧</span>
            <span class="pt-legend-item"><i class="pt-legend-dot pt-legend-dot--danger" /> 转负</span>
          </div>
        </div>

        <!-- 当日明细：常驻右侧栏（宽屏 sticky），先用等式讲清「每天为什么变」 -->
        <aside class="cal-detail">
          <SectionCard class="day-detail" title="当日明细" icon="listCheck">
            <div class="dd-head">
              <div>
                <b>{{ selectedLabel }}</b>
                <div class="dd-sub muted">{{ dayHeadline }}</div>
              </div>
              <span class="muted dd-bal">{{ dayBalanceText }}</span>
            </div>

            <div class="dd-equation">
              <div class="eq-row"><span>前一天余额</span><b>{{ formatMoney(prevBalance) }}</b></div>
              <div class="eq-row eq-in"><span>当日进账</span><b>+ {{ formatMoney(dayIncome) }}</b></div>
              <div class="eq-row eq-out"><span>当日支出</span><b>− {{ formatMoney(dayOutflow) }}</b></div>
              <div class="eq-row eq-total">
                <span>＝ 当日余额</span>
                <b :class="dayBalance < 0 ? 'text-danger' : 'text-success'">{{ formatMoney(dayBalance) }}</b>
              </div>
            </div>

            <div class="dd-section-title">具体是哪几笔</div>
            <div v-if="selectedItems.length" class="dd-list">
              <div
                v-for="(it, i) in selectedItems"
                :key="i"
                class="dd-item stagger-in"
                :class="'ev-' + it.type"
                :style="{ '--i': i }"
              >
                <span class="dd-tag">{{ it.tag }}</span>
                <span class="dd-name">
                  {{ it.name }}
                  <small v-if="it.note" class="dd-note">{{ it.note }}</small>
                </span>
                <b class="dd-amt" :class="it.amount >= 0 ? 'text-success' : 'text-danger'">
                  {{ it.amount >= 0 ? '+' : '' }}{{ formatMoney(it.amount) }}
                </b>
              </div>
            </div>
            <EmptyState v-else text="这天按档案推演没有固定收支：没到发薪 / 还款日，日常零花也没记账。" icon="inbox" />
            <div class="dd-foot muted">
              以上是按档案推演的预计金额，不是真实流水；标「均摊」的是月固定开支平摊到今天的份额，不是当天真实刷卡。
            </div>
          </SectionCard>
        </aside>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useAuthStore } from '../stores/auth'
import { useAppStore } from '../stores/app'
import { buildMonthProjection } from '../composables/useProjection'
import { todayISO } from '../lib/date'
import {
  readStartBalance, readRecurringRepayment, readExpenseSpreadMode,
  readAssumePreTax, readScenarioBonusEnabled, readScenarioBonus, readScenarioBonusDay
} from '../lib/prefs'
import { formatMoney } from '../lib/labels'
import { round2 } from '../lib/validation'
import { classifyDay, getHolidayCalendarInfo } from '../lib/holidays2026'
import { trackEvent } from '../lib/analytics'
import { subscribeFlowChange } from '../lib/flowChannel'
import { SAFETY_LINE } from '../lib/constants'
import Mascot from '../components/Mascot.vue'

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
const onTxChange = () => { prefRevision.value++ }
let unsubFlow = null
const monthProjection = computed(() => {
  void prefRevision.value
  // 情景参数与仪表盘同源：调薪假设 / 补贴试算一处调整，日历的每日余额同步重算
  const assumePreTax = readAssumePreTax()
  const bonus = readScenarioBonusEnabled()
    ? { amount: readScenarioBonus(), day: readScenarioBonusDay() }
    : null
  return buildMonthProjection({
    app,
    startBalance: readStartBalance(),
    recurringRepayment: readRecurringRepayment(),
    assumePreTax,
    baseYear: todayYear,
    baseMonth: todayMonth,
    year: viewYear.value,
    month: viewMonth.value,
    actuals: app.transactions,
    bonus
  })
})
const cf = computed(() => monthProjection.value.projection.cf)
const holidayInfo = computed(() => {
  void prefRevision.value
  return getHolidayCalendarInfo()
})
const spreadHint = computed(() => {
  void prefRevision.value
  return readExpenseSpreadMode() === 'daily'
    ? '月固定开支按当月天数均摊到每天（全月合计不变），日度余额更贴近真实'
    : '月固定开支全部计入各自扣费日当天'
})
const calendarIncomplete = computed(() => viewYear.value > 2026)

// 埋点：记录该月命中节假日 / 调休补班的节点（资金日期按用户决策不顺延，rule=keep）
function reportHoliday() {
  const types = cf.value?.dayTypes || []
  const legal = types.filter((t) => t === 'legal').length
  const makeup = types.filter((t) => t === 'makeup').length
  if (!legal && !makeup) return
  trackEvent('holiday_adjusted', {
    year: viewYear.value, month: viewMonth.value,
    legal_days: legal, makeup_days: makeup, rule: 'keep'
  }, `${viewYear.value}-${viewMonth.value}`)
}
watch([viewYear, viewMonth], () => reportHoliday())

// 逐日数据与事件按天归类
const dailyByDay = computed(() => {
  const map = {}
  cf.value.daily.forEach((x) => { map[x.day] = x })
  return map
})
const eventsByDay = computed(() => {
  const map = {}
  cf.value.events.forEach((e) => {
    (map[e.day] = map[e.day] || []).push(e)
  })
  return map
})

// 当月每日单元格：余额 + 当天净变化，两个数都明确标注，避免误读成「今天花了多少」
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
    const row = dailyByDay.value[d] || {}
    out.push({
      day: d,
      balance: row.balance ?? 0,
      delta: round2((Number(row.income) || 0) - (Number(row.outflow) || 0)),
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

const selectedLabel = computed(() =>
  `${viewYear.value} 年 ${viewMonth.value} 月 ${selectedDay.value} 日`
)
const dayRow = computed(() => dailyByDay.value[selectedDay.value] || null)
const dayIncome = computed(() => Number(dayRow.value?.income) || 0)
const dayOutflow = computed(() => Number(dayRow.value?.outflow) || 0)
const dayBalance = computed(() => dayRow.value?.balance ?? 0)
const dayDelta = computed(() => round2(dayIncome.value - dayOutflow.value))
const prevBalance = computed(() => selectedDay.value > 1
  ? (dailyByDay.value[selectedDay.value - 1]?.balance ?? monthProjection.value.startBalance)
  : monthProjection.value.startBalance
)
const dayBalanceText = computed(() =>
  dayRow.value ? `当天余额 ${formatMoney(dayBalance.value)}` : ''
)
const dayHeadline = computed(() => {
  if (!dayIncome.value && !dayOutflow.value) return '这天按档案推演没有固定收支，余额不变。'
  const bits = []
  if (dayIncome.value) bits.push(`进账 ${formatMoney(dayIncome.value)}`)
  if (dayOutflow.value) bits.push(`支出 ${formatMoney(dayOutflow.value)}`)
  return `当日${bits.join('，')}，所以余额${dayDelta.value >= 0 ? '增加' : '减少'} ${formatMoney(Math.abs(dayDelta.value))}。`
})

// 逐笔展开：引擎在 events[].items 里给出每笔名称与金额，
// 不再把多个开支名字用顿号拼成一行让用户猜「到底是哪一笔」。
const selectedItems = computed(() => {
  const out = []
  ;(eventsByDay.value[selectedDay.value] || []).forEach((e) => {
    const items = Array.isArray(e.items) ? e.items : []
    if (items.length) {
      items.forEach((it) => out.push({
        type: e.type,
        tag: evLabel[e.type] || '其他',
        name: it.name,
        note: it.spread ? '均摊' : (e.type === 'repay' ? '账单当天扣款' : ''),
        amount: e.type === 'pay'
          ? Math.abs(Number(it.amount) || 0)
          : -Math.abs(Number(it.amount) || 0)
      }))
    } else {
      out.push({
        type: e.type, tag: evLabel[e.type] || '其他',
        name: e.label || '收支', note: '', amount: Number(e.amount) || 0
      })
    }
  })
  return out
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

// 跨月推演按 offset 线性滚动，且节假日静态表只覆盖 2026（2027 仅元旦兜底）：
// 限制在当前月前后 24 个月，避免无界切月造成长耗时与不可信结果。
const MAX_MONTH_OFFSET = 24
function monthOffset() {
  return (viewYear.value - todayYear) * 12 + (viewMonth.value - todayMonth)
}
function prevMonth() {
  if (monthOffset() <= -MAX_MONTH_OFFSET) return
  if (viewMonth.value === 1) { viewMonth.value = 12; viewYear.value-- } else viewMonth.value--
  selectedDay.value = 1
}
function nextMonth() {
  if (monthOffset() >= MAX_MONTH_OFFSET) return
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
  window.addEventListener('paytrace:transactions-changed', onTxChange)
  window.addEventListener('storage', onPrefChange)
  unsubFlow = subscribeFlowChange(() => {
    app.reloadTransactions({ silent: true }).catch(() => {})
    prefRevision.value++
  })
  loading.value = true
  try {
    await auth.ensureReady()
    if (auth.userId) await app.load()
    reportHoliday()
  } finally {
    loading.value = false
  }
})
onUnmounted(() => {
  window.removeEventListener('paytrace:pref-changed', onPrefChange)
  window.removeEventListener('paytrace:transactions-changed', onTxChange)
  window.removeEventListener('storage', onPrefChange)
  unsubFlow?.()
})
</script>

<style scoped>
/* 整月网格突破 1240 收敛：抵消内容区内边距，做到接近通栏 */
.cal.pt-bleed { margin-left: -36px; margin-right: -36px; padding-left: 36px; padding-right: 36px; }

/* 顶栏：左身份 + 中月份切换 + 右心情 */
.cal-head-bar { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; margin-bottom: 14px; }
.cal-id { display: flex; flex-direction: column; gap: 4px; margin-right: auto; }
.cal-eyebrow {
  font-size: var(--fs-micro); font-weight: 800; letter-spacing: .14em; text-transform: uppercase;
  color: var(--c-primary); background: var(--c-primary-soft); border-radius: var(--r-pill);
  padding: 3px 10px; align-self: flex-start;
}
.cal-title-h { font-size: 26px; font-weight: 750; line-height: 1.2; letter-spacing: -.02em; margin: 0; color: var(--c-text); }
.cal-nav { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.cal-title { font-size: 16px; }
.cal-mood { display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 600; padding: 4px 12px 4px 4px; border-radius: var(--r-pill); flex-wrap: wrap; }
.mood-sub { font-size: 12px; font-weight: 400; color: var(--c-text-3); }
.m-ok { color: var(--c-success); background: var(--c-success-soft); }
.m-mid { color: var(--c-primary); background: var(--c-primary-soft); }
.m-low { color: var(--c-warning-text); background: var(--c-warning-soft); }
.m-neg { color: var(--c-danger); background: var(--c-danger-soft); }

.cal-sub { font-size: 13px; color: var(--c-text-2); margin: 0 0 12px; max-width: 900px; line-height: 1.7; }

/* 读法说明：三条并排 slim strip */
.cal-readhint { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-bottom: 10px; }
.rh-item {
  display: flex; flex-direction: column; gap: 3px;
  padding: 10px 14px;
  border: 1px solid var(--c-border);
  border-radius: var(--radius-sm);
  background: var(--c-surface-2);
}
.rh-item b { font-size: 13px; color: var(--c-primary); }
.rh-item span { font-size: 12px; color: var(--c-text-2); line-height: 1.6; }

/* 口径提示条 */
.cal-note { display: flex; gap: 12px; flex-wrap: wrap; font-size: 12px; padding: 8px 10px; border: 1px solid var(--c-border); border-radius: var(--radius-sm); background: var(--c-surface-2); margin-top: 10px; line-height: 1.7; }
.note-warn { color: var(--c-warning-text); }

/* 通栏布局：左网格 + 右 sticky 明细 */
.cal-layout { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 18px; align-items: start; margin-top: 14px; }
.cal-grid-wrap { min-width: 0; }

/* 日历网格 */
.cal-grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 8px; }
.cal-week { margin-bottom: 6px; }
.cal-weekname { text-align: center; font-size: 12px; color: var(--c-text-3); padding: 4px 0; }
.cal-cell { min-height: 96px; }
/* 首周空白格：淡占位，补齐网格、消除视觉断裂 */
.cal-blank, .cal-cell:empty {
  min-height: 96px;
  border: 1px dashed var(--c-border);
  border-radius: var(--radius-sm);
  background: var(--c-surface-2);
}
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
  border-radius: var(--radius-sm);
  padding: 7px 9px;
  cursor: pointer;
  display: flex; flex-direction: column; gap: 3px;
  background: var(--c-surface);
  transition: transform var(--dur-fast) var(--ease-out),
              border-color var(--dur-fast) ease,
              box-shadow var(--dur-fast) ease,
              background-color var(--dur-base) ease;
}
.cal-day:hover { transform: translateY(-2px); border-color: var(--c-primary); }
.cal-daynum { font-size: 13px; font-weight: 600; display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
.daytype { font-size: 10px; line-height: 14px; padding: 0 4px; border-radius: 3px; color: var(--c-text-2); background: var(--c-hover); flex-shrink: 0; }
.dt-legal { color: var(--c-danger); background: var(--c-danger-soft); }
.dt-makeup { color: var(--c-warning-text); background: var(--c-warning-soft); }
.dt-weekend { color: var(--c-text-3); background: var(--c-hover); }
.today-pill { background: var(--c-primary); color: var(--c-surface); font-size: 10px; padding: 0 4px; border-radius: 4px; }
.cal-balance-row { display: flex; align-items: baseline; gap: 5px; }
.cal-balance-label { font-size: 10px; color: var(--c-text-3); flex-shrink: 0; }
.cal-balance { font-size: 16px; font-weight: 700; font-variant-numeric: tabular-nums; letter-spacing: -.01em; }
.cal-delta { font-size: 12px; font-weight: 600; font-variant-numeric: tabular-nums; color: var(--c-text-2); }
.cal-delta.d-up { color: var(--c-success); }
.delta-word { font-size: 10px; font-weight: 400; color: var(--c-text-3); margin-left: 3px; }
.cal-marks { display: flex; gap: 4px; margin-top: auto; }
.mark { font-size: 10px; line-height: 16px; width: 16px; height: 16px; text-align: center; border-radius: 4px; color: var(--c-surface); }
.mark-pay { background: var(--c-success); }
.mark-rep { background: var(--c-danger); }

/* 余额健康度：只给余额数字着色，不再把净变化染红误导成花费 */
.h-ok .cal-balance { color: var(--c-success); }
.h-mid .cal-balance { color: var(--c-primary); }
.h-low .cal-balance { color: var(--c-warning-text); }
.h-low { background: var(--c-warning-soft); }
.h-neg .cal-balance { color: var(--c-danger); }
.h-neg { background: var(--c-danger-soft); border-color: var(--c-danger); }
.is-selected { border-color: var(--c-primary); box-shadow: 0 0 0 2px var(--c-primary-soft); }

/* 当日明细：等式卡 + 逐笔清单（交错入场交给全局 .stagger-in + --i） */
.cal-detail { position: sticky; top: 16px; }
.day-detail { margin-top: 0; }
.dd-head { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; margin-bottom: 12px; flex-wrap: wrap; }
.dd-sub { font-size: 12px; line-height: 1.6; margin-top: 3px; }
.dd-bal { font-size: 12px; white-space: nowrap; }
.dd-equation {
  border: 1px dashed var(--c-border); border-radius: var(--radius-sm);
  background: var(--c-surface-2); padding: 10px 14px; margin-bottom: 16px;
}
.eq-row { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; font-size: 13px; padding: 4px 0; color: var(--c-text-2); }
.eq-row b { font-variant-numeric: tabular-nums; color: var(--c-text); }
.eq-in b { color: var(--c-success); }
.eq-out b { color: var(--c-danger); }
.eq-total { border-top: 1px solid var(--c-border); margin-top: 4px; padding-top: 9px; font-weight: 600; color: var(--c-text); }
.eq-total b { font-size: 16px; }
.dd-section-title { font-size: 13px; font-weight: 600; margin-bottom: 10px; }
.dd-list { display: flex; flex-direction: column; gap: 8px; }
.dd-item { display: flex; align-items: center; gap: 10px; font-size: 13px; flex-wrap: wrap; }
.dd-tag { font-size: 11px; padding: 2px 8px; border-radius: 4px; color: var(--c-text-2); background: var(--c-hover); flex-shrink: 0; }
.ev-pay .dd-tag { color: var(--c-success); background: var(--c-success-soft); }
.ev-repay .dd-tag { color: var(--c-danger); background: var(--c-danger-soft); }
.dd-name { flex: 1; color: var(--c-text-2); min-width: 0; }
.dd-note { display: block; font-size: 11px; color: var(--c-text-3); margin-top: 2px; }
.dd-amt { font-variant-numeric: tabular-nums; white-space: nowrap; }
.dd-foot { font-size: 11px; line-height: 1.7; margin-top: 12px; padding-top: 10px; border-top: 1px solid var(--c-border); }

@media (max-width: 1080px) {
  .cal-layout { grid-template-columns: minmax(0, 1fr); }
  .cal-detail { position: static; }
}
@media (max-width: 768px) {
  .cal.pt-bleed { margin-left: -14px; margin-right: -14px; padding-left: 14px; padding-right: 14px; }
  .cal-head-bar { gap: 10px; }
  .cal-title-h { font-size: 21px; }
  .cal-readhint { grid-template-columns: 1fr; gap: 8px; }
  .cal-grid { gap: 5px; grid-template-columns: repeat(7, minmax(0, 1fr)); }
  .cal-cell, .cal-blank, .cal-cell:empty { min-height: 74px; }
  .cal-day { padding: 5px 6px; }
  .cal-balance { font-size: 12px; }
  .cal-balance-label, .delta-word { display: none; }
  .cal-delta { font-size: 10px; }
  .cal-daynum { font-size: 12px; }
  .mark { width: 14px; height: 14px; line-height: 14px; font-size: 9px; }
  .cal-nav { gap: 6px; }
  .dd-head, .eq-row { gap: 8px; }
}
</style>
