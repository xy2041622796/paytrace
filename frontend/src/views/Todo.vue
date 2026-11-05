<template>
  <div class="todo">
    <h2 class="page-title">待办事项</h2>
    <p class="muted">记录还款提醒、补贴申报、账单到期等事项，关联日期后会自动按紧急程度置顶。</p>

    <n-alert v-if="overdueCount || soonCount" type="warning" :bordered="false" class="todo-alert">
      有 {{ overdueCount }} 项已逾期、{{ soonCount }} 项 3 天内到期，已排在最前面。
    </n-alert>

    <div class="add">
      <n-input v-model:value="newTitle" placeholder="待办内容（如 11月25日还白条）" style="width:260px" />
      <n-date-picker v-model:value="newDate" type="date" clearable placeholder="关联日期（可选）" />
      <n-button type="primary" @click="add">添加</n-button>
    </div>

    <div class="table-scroll">
      <n-data-table
        :columns="cols" :data="displayTodos" :row-props="rowProps"
        :bordered="false" size="small" :scroll-x="940"
      />
    </div>
    <p v-if="!displayTodos.length" class="muted empty">暂无待办事项，添加一条开始规划吧。</p>
    <p class="muted linked-tip">带「还款日历」标签的待办由还款账单自动生成，仅本地计算、不写入待办清单；点按可跳转还款日历。</p>
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
.page-title { font-size: 20px; font-weight: 600; margin: 0 0 4px; }
.todo-alert { margin: 14px 0; }
.add { display: flex; gap: 10px; margin: 16px 0; align-items: center; flex-wrap: wrap; }
.table-scroll { overflow-x: auto; }
.empty { margin-top: 14px; font-size: 13px; }
.linked-tip { margin-top: 10px; font-size: 12px; line-height: 1.7; }
.cell-title { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.src-tag {
  font-size: 11px; padding: 1px 6px; border-radius: 4px; flex-shrink: 0;
  background: var(--c-hover); color: var(--c-text-2);
}
.text-warning { color: var(--c-warning); }

@media (max-width: 768px) {
  .add > * { flex: 1 1 140px; }
}
</style>
