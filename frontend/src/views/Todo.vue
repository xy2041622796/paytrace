<template>
  <div class="todo pt-page">
    <!-- 页身份：左对齐，不再套用居中页头 -->
    <header class="todo-head">
      <span class="todo-eyebrow">规划</span>
      <h1 class="todo-title-x">待办事项</h1>
      <p class="todo-desc">记录还款提醒、补贴申报、账单到期等事项，关联日期后会自动按紧急程度置顶。</p>
    </header>

    <!-- 分诊摘要：逾期 / 3 天内 / 其他，一眼看清最该先处理什么 -->
    <div class="tri-band">
      <div class="tri-cell t-urgent"><b>{{ overdueCount }}</b><span>已逾期</span></div>
      <div class="tri-cell t-soon"><b>{{ soonCount }}</b><span>3 天内到期</span></div>
      <div class="tri-cell t-rest"><b>{{ displayTodos.length - overdueCount - soonCount }}</b><span>其他待办</span></div>
    </div>

    <!-- 添加条 -->
    <div class="todo-add">
      <n-input v-model:value="newTitle" placeholder="待办内容（如 11月25日还白条）" style="width:260px" />
      <n-date-picker v-model:value="newDate" type="date" clearable placeholder="关联日期（可选）" />
      <n-button type="primary" @click="add">添加</n-button>
    </div>

    <!-- 分诊清单：按紧急度排序，逾期 / 3 天内左侧高亮；联动还款行可点跳转 -->
    <section class="todo-board">
      <div
        v-for="t in displayTodos" :key="t.id"
        class="todo-row"
        :class="['p' + priorityOf(t), { done: t.status === 'done', linked: t.linked }]"
        @click="t.linked ? goCalendar() : null"
      >
        <button v-if="!t.linked" type="button" class="todo-chk" :class="{ on: t.status === 'done' }" :aria-label="t.status === 'done' ? '标为待办' : '完成'" @click.stop="toggle(t)">✓</button>
        <span v-else class="todo-src">还款日历</span>

        <div class="todo-main">
          <div class="todo-title" :class="{ 'text-danger': t.overdue }">{{ t.title }}</div>
          <div class="todo-sub">
            <span v-if="t.related_repay_date">{{ formatDateCN(t.related_repay_date) }}</span>
            <span v-if="t.amount && t.linked" :class="t.overdue ? 'text-danger' : ''">{{ formatMoney(t.amount) }}</span>
            <span v-if="t.daysLeft != null" :class="t.daysLeft < 0 ? 'text-danger' : (t.daysLeft <= 3 ? 'text-warning' : 'muted')">{{ t.daysLeft < 0 ? `逾期 ${-t.daysLeft} 天` : (t.daysLeft === 0 ? '今天到期' : t.daysLeft + ' 天') }}</span>
          </div>
        </div>

        <span class="todo-badge" :class="priorityOf(t) === 0 ? 'b-urgent' : (priorityOf(t) === 1 ? 'b-soon' : 'b-mute')">{{ PRIORITY_LABEL[priorityOf(t)] }}</span>

        <button v-if="t.linked" type="button" class="todo-go" @click.stop="goCalendar">查看</button>
        <button v-else type="button" class="todo-del" @click.stop="del(t)">删除</button>
      </div>

      <EmptyState v-if="!displayTodos.length" text="暂无待办事项，添加一条开始规划吧。" icon="inbox" class="todo-empty" />
    </section>

    <p class="pt-note todo-note">带「还款日历」标签的待办由还款账单自动生成，仅本地计算、不写入待办清单；点按可跳转还款日历。</p>
  </div>
</template>

<script setup>
import { ref, computed, h, onMounted } from 'vue'
import { useMessage, NButton } from 'naive-ui'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/auth'
import { useAppStore } from '../stores/app'
import { TODO_STATUS_LABEL, formatDateCN, formatMoney } from '../lib/labels'
import { toLocalISODate } from '../lib/date'

const message = useMessage()
const auth = useAuthStore()
const app = useAppStore()
const todos = ref([])
const newTitle = ref('')
const newDate = ref(null)

// 跳转还款日历（hash 路由）
function goCalendar() {
  window.location.hash = '#/calendar'
}

// 紧急度：逾期 > 3天内 > 7天内 > 无日期 > 远期 > 已完成
function priorityOf(row) {
  if (row.status === 'done') return 5
  if (!row.related_repay_date) return 3
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(`${row.related_repay_date}T00:00:00`)
  if (Number.isNaN(due.getTime())) return 3
  const days = Math.round((due - today) / 86400000)
  if (days < 0) return 0
  if (days <= 3) return 1
  if (days <= 7) return 2
  return 4
}

const PRIORITY_LABEL = { 0: '已逾期', 1: '3 天内', 2: '7 天内', 3: '未设日期', 4: '待办', 5: '已完成' }

// 还款日历联动待办：纯本地计算、不写库。
// 去重口径 due_date + amount：既跳过账单里同日同额的重复行，也跳过手动待办里已记过的同一笔。
// 标题里的金额按「独立数字」比对，避免 "800" 误命中 "1800" 或日期里的 "25"。
function manualCovers(date, amount) {
  const target = Number(amount)
  return todos.value.some((t) => {
    if (String(t.related_repay_date || '') !== String(date)) return false
    const nums = String(t.title || '').match(/\d+(?:\.\d+)?/g) || []
    return nums.some((n) => Math.abs(Number(n) - target) < 0.005)
  })
}

const linkedTodos = computed(() => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const seen = new Set()
  const list = []
  for (const r of (app.repayments || [])) {
    const date = String(r.due_date || '')
    const amount = Number(r.amount) || 0
    if (!date || amount <= 0 || r.status === 'paid') continue
    const key = `${date}#${amount}`
    if (seen.has(key) || manualCovers(date, amount)) continue
    const due = new Date(`${date}T00:00:00`)
    if (Number.isNaN(due.getTime())) continue
    seen.add(key)
    const daysLeft = Math.round((due - today) / 86400000)
    list.push({
      id: `linked:${r.id || key}`,
      linked: true,
      title: '还款扣款',
      related_repay_date: date,
      amount,
      daysLeft,
      overdue: daysLeft < 0,
      status: 'open'
    })
  }
  return list
})

// 手动 + 联动合并展示，排序完全沿用 priorityOf：逾期 / 3 天内自然置顶
const displayTodos = computed(() => [...todos.value, ...linkedTodos.value]
  .sort((a, b) => {
    const d = priorityOf(a) - priorityOf(b)
    return d || (Number(!!b.linked) - Number(!!a.linked))
  }))
const overdueCount = computed(() => displayTodos.value.filter((t) => priorityOf(t) === 0).length)
const soonCount = computed(() => displayTodos.value.filter((t) => priorityOf(t) === 1).length)

// 联动行整行可点：跳到还款日历
const rowProps = (row) => row.linked
  ? { class: 'linked-row', style: { cursor: 'pointer' }, onClick: () => goCalendar() }
  : {}

const cols = [
  {
    title: '内容', key: 'title', width: 210,
    render: (row) => h('div', { class: 'cell-title' }, [
      row.linked ? h('span', { class: 'src-tag' }, '还款日历') : null,
      h('span', { class: row.overdue ? 'text-danger' : '' }, row.title)
    ])
  },
  {
    title: '关联日期', key: 'related_repay_date', width: 120,
    render: (row) => formatDateCN(row.related_repay_date)
  },
  {
    title: '金额', key: 'amount', width: 120,
    render: (row) => row.linked ? h('span', { class: row.overdue ? 'text-danger' : '' }, formatMoney(row.amount)) : '—'
  },
  {
    title: '剩余天数', key: 'daysLeft', width: 110,
    render: (row) => {
      if (!row.linked) return '—'
      if (row.daysLeft < 0) return h('b', { class: 'text-danger' }, `已逾期 ${-row.daysLeft} 天`)
      if (row.daysLeft === 0) return h('b', { class: 'text-danger' }, '今天到期')
      return `${row.daysLeft} 天`
    }
  },
  {
    title: '紧急度', key: 'priority', width: 100,
    render: (row) => {
      const p = priorityOf(row)
      const cls = p === 0 ? 'text-danger' : p === 1 ? 'text-warning' : 'muted'
      return h('span', { class: cls }, PRIORITY_LABEL[p])
    }
  },
  {
    title: '状态', key: 'status', width: 100,
    render: (row) => row.linked ? '待还款' : (TODO_STATUS_LABEL[row.status] || row.status)
  },
  {
    title: '操作', key: 'action', width: 150,
    render: (row) => row.linked
      ? h(NButton, {
        size: 'small', quaternary: true, type: 'primary',
        onClick: (e) => { e?.stopPropagation?.(); goCalendar() }
      }, { default: () => '查看还款日历' })
      : h('div', { class: 'ops' }, [
        h(NButton, {
          size: 'small', quaternary: true,
          type: row.status === 'done' ? 'default' : 'primary',
          onClick: () => toggle(row)
        }, { default: () => (row.status === 'done' ? '标为待办' : '完成') }),
        h(NButton, {
          size: 'small', quaternary: true, type: 'error',
          onClick: () => del(row)
        }, { default: () => '删除' })
      ])
  }
]

async function add() {
  const title = newTitle.value.trim().slice(0, 120)
  if (!title) return message.warning('请填写待办内容')
  await auth.ensureReady()
  const userId = auth.userId
  if (!userId) return message.error('未登录')
  const { error } = await supabase.from('todo').insert({
    user_id: userId,
    title,
    related_repay_date: toLocalISODate(newDate.value)
  })
  if (error) return message.error(error.message)
  newTitle.value = ''
  newDate.value = null
  await load()
}

async function toggle(row) {
  const { error } = await supabase.from('todo').update({
    status: row.status === 'done' ? 'open' : 'done'
  }).eq('id', row.id)
  if (error) return message.error(error.message)
  await load()
}

async function del(row) {
  const { error } = await supabase.from('todo').delete().eq('id', row.id)
  if (error) return message.error(error.message)
  await load()
}

async function load() {
  await auth.ensureReady()
  const userId = auth.userId
  if (!userId) return
  // 还款日历档案用于本地生成联动待办；失败不阻断手动待办的读取
  try {
    await app.load()
  } catch (e) {
    message.error(e.message || '档案加载失败')
  }
  const { data } = await supabase.from('todo').select('*')
    .eq('user_id', userId).order('created_at', { ascending: false })
  todos.value = (data || []).sort((a, b) => priorityOf(a) - priorityOf(b))
}

onMounted(load)
</script>

<style scoped>
/* 全局骨架 / 卡片 / 表格 / 空状态 / 语义文字由 theme.css 统一提供，本页只保留特有结构 */
.todo { min-width: 0; }

/* 页身份 */
.todo-head { max-width: 720px; margin-bottom: 18px; }
.todo-eyebrow { display: inline-block; font-size: var(--fs-caption); letter-spacing: .14em; color: var(--c-primary); margin-bottom: 6px; }
.todo-title-x { font-size: var(--fs-display); font-weight: 700; line-height: 1.08; margin: 0; color: var(--c-text); }
.todo-desc { margin: 8px 0 0; font-size: var(--fs-body); color: var(--c-text-2); line-height: 1.6; }

/* 分诊摘要带：逾期 / 3 天内 / 其他 */
.tri-band { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-bottom: 16px; }
.tri-cell {
  display: flex; flex-direction: column; gap: 2px;
  padding: 14px 16px; border-radius: 12px;
  background: var(--c-surface); border: 1px solid var(--c-border);
}
.tri-cell b { font-size: var(--fs-display); font-weight: 700; line-height: 1; }
.tri-cell span { font-size: var(--fs-caption); color: var(--c-text-2); }
.tri-cell.t-urgent { border-color: var(--c-danger-soft); }
.tri-cell.t-urgent b { color: var(--c-danger); }
.tri-cell.t-soon { border-color: var(--c-warning-soft); }
.tri-cell.t-soon b { color: var(--c-warning); }

/* 添加条：作为唯一强调区（accent 表面） */
.todo-add {
  display: flex; gap: 10px; align-items: center; flex-wrap: wrap;
  padding: 12px 16px; margin-bottom: 18px;
  background: var(--c-primary-soft); border: 1px solid var(--c-primary-soft-2); border-radius: 12px;
}

/* 分诊清单：按紧急度排序，逾期 / 3 天内左侧高亮 */
.todo-board { display: flex; flex-direction: column; gap: 8px; }
.todo-row {
  display: flex; align-items: center; gap: 12px;
  padding: 12px 14px; background: var(--c-surface);
  border: 1px solid var(--c-border); border-left: 3px solid var(--c-border);
  border-radius: 10px;
}
.todo-row.p0 { border-left-color: var(--c-danger); }
.todo-row.p1 { border-left-color: var(--c-warning); }
.todo-row.done { opacity: .6; }
.todo-row.linked { cursor: pointer; }
.todo-row.linked:hover { border-color: var(--c-primary); }

.todo-chk {
  width: 22px; height: 22px; flex: 0 0 auto; border-radius: 6px;
  border: 1.5px solid var(--c-border-strong); background: var(--c-surface);
  color: #fff; cursor: pointer; display: flex; align-items: center; justify-content: center;
  font-size: 13px; line-height: 1; transition: background var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out);
}
.todo-chk.on { background: var(--c-primary); border-color: var(--c-primary); }
.todo-src {
  font-size: var(--fs-micro); padding: 2px 6px; border-radius: var(--r-xs); flex: 0 0 auto;
  background: var(--c-hover); color: var(--c-text-2);
}
.todo-main { flex: 1 1 auto; min-width: 0; }
.todo-title { font-size: var(--fs-body); font-weight: 600; color: var(--c-text); word-break: break-word; }
.todo-row.done .todo-title { text-decoration: line-through; }
.todo-sub { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 2px; font-size: var(--fs-caption); color: var(--c-text-2); }
.todo-badge { font-size: var(--fs-micro); padding: 2px 8px; border-radius: 999px; flex: 0 0 auto; }
.todo-badge.b-urgent { color: var(--c-danger); background: var(--c-danger-soft); }
.todo-badge.b-soon { color: var(--c-warning); background: var(--c-warning-soft); }
.todo-badge.b-mute { color: var(--c-text-2); background: var(--c-hover); }
.todo-go, .todo-del {
  flex: 0 0 auto; font-size: var(--fs-caption); border: 0; background: transparent;
  cursor: pointer; color: var(--c-text-2); padding: 4px 8px; border-radius: 6px;
  transition: background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out);
}
.todo-go:hover, .todo-del:hover { background: var(--c-hover); }
.todo-del:hover { color: var(--c-danger); }
.todo-empty { padding: 30px; }
.todo-note { margin: 16px 0 0; }

@media (max-width: 768px) {
  .tri-band { grid-template-columns: 1fr; gap: 10px; }
  .todo-add > * { flex: 1 1 100%; min-width: 0; }
}
</style>
