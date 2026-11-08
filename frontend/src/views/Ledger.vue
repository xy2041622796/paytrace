<template>
  <div class="led pt-page">
    <!-- 页身份：左对齐，与本月条数同行，不再套用居中页头 -->
    <header class="led-head">
      <div class="led-head-main">
        <span class="led-eyebrow">账本</span>
        <h1 class="led-title">流水账本</h1>
        <p class="led-desc">记录每一笔收支，智能记账写入的流水也会汇总到这里。数据仅本人可见。</p>
      </div>
      <div class="led-head-side">
        <StatusChip tone="info">{{ filteredRows.length }} / {{ rows.length }} 条流水</StatusChip>
      </div>
    </header>

    <!-- 命令栏：选月份 + 搜索，常驻工作台顶部 -->
    <div class="led-bar">
      <div class="led-bar-field">
        <span class="led-bar-label">查看月份</span>
        <n-date-picker v-model:value="selectedMonth" type="month" clearable="false" style="width:160px" />
      </div>
      <div class="led-bar-field grow">
        <span class="led-bar-label">搜索分类 / 备注 / 金额</span>
        <n-input v-model:value="keyword" placeholder="如 餐饮、房租、45" clearable />
      </div>
    </div>

    <!-- 记一笔：压成顶部内联操作条，作为全页唯一强调区 -->
    <div class="led-add">
      <span class="led-add-kicker">记一笔</span>
      <n-date-picker v-model:value="form.date" type="date" clearable placeholder="日期" style="width:160px" />
      <n-select v-model:value="form.direction" :options="directionOptions" style="width:110px" />
      <n-input v-model:value="form.category" placeholder="分类（如 餐饮）" style="width:150px" />
      <n-input-number v-model:value="form.amount" :min="0" placeholder="金额" style="width:130px" />
      <n-input v-model:value="form.note" placeholder="备注（可选）" style="width:170px" />
      <n-button type="primary" :loading="saving" :disabled="saving" @click="add">保存</n-button>
    </div>

    <!-- 编辑已有流水：金额 / 分类 / 日期录错时不必删了重建 -->
    <div v-if="editingTxn.id" class="led-add led-edit">
      <span class="led-add-kicker">编辑流水</span>
      <n-date-picker v-model:value="editingTxn.date" type="date" clearable placeholder="日期" style="width:160px" />
      <n-select v-model:value="editingTxn.direction" :options="directionOptions" style="width:110px" />
      <n-input v-model:value="editingTxn.category" placeholder="分类" style="width:150px" />
      <n-input-number v-model:value="editingTxn.amount" :min="0" placeholder="金额" style="width:130px" />
      <n-input v-model:value="editingTxn.note" placeholder="备注（可选）" style="width:170px" />
      <n-button type="primary" :loading="saving" :disabled="saving" @click="updateTxn">保存</n-button>
      <n-button :disabled="saving" @click="cancelEditTxn">取消</n-button>
    </div>

    <!-- 本月三数：收入 / 支出 / 净额 -->
    <div class="led-stats">
      <StatCard tone="success">
        <template #label>{{ monthTitle }}收入</template>
        <span class="text-success">{{ formatMoney(monthIncome) }}</span>
      </StatCard>
      <StatCard tone="danger">
        <template #label>{{ monthTitle }}支出</template>
        <span class="text-danger">{{ formatMoney(monthExpense) }}</span>
      </StatCard>
      <StatCard :value-class="monthNet < 0 ? 'text-danger' : 'text-primary'">
        <template #label>{{ monthTitle }}净额</template>
        <span :class="monthNet < 0 ? 'text-danger' : 'text-primary'">{{ formatMoney(monthNet) }}</span>
      </StatCard>
    </div>

    <!-- 主工作区：左流水（主）/ 右支出构成（次） -->
    <div class="led-split">
      <SectionCard :title="`${monthTitle}流水`" icon="listCheck" desc="当月全部流水，可导出为表格文件">
        <div class="table-scroll">
          <n-data-table :columns="columns" :data="filteredRows" :bordered="false" size="small" :scroll-x="720" />
        </div>
        <div class="export-row">
          <n-button size="small" :disabled="!filteredRows.length || saving" @click="exportCsv">导出为表格文件</n-button>
          <span class="muted led-hint">导出当前搜索结果为 CSV，可用 Excel / WPS 打开。金额打码只影响屏幕显示，导出为明文，请妥善保管。</span>
        </div>
      </SectionCard>

      <SectionCard title="支出构成" icon="chart" desc="按分类看这个月的钱花在哪">
        <EmptyState v-if="!categoryRows.length" text="这个月还没有支出流水。" icon="inbox" />
        <div v-for="c in categoryRows" :key="c.name" class="cat-row">
          <span class="cat-name">{{ c.name }}</span>
          <div class="cat-track"><div class="cat-fill" :style="{ width: c.percent + '%' }" /></div>
          <span class="cat-amount">{{ formatMoney(c.amount) }}</span>
        </div>
      </SectionCard>
    </div>

    <!-- 待收收入：独立状态机，未到账不计入余额 -->
    <SectionCard class="led-pending" title="待收收入" icon="coins" desc="未到账收入单独登记，到账后一键写入流水">
      <div class="pt-note ledger-note">奖金、补贴等尚未到账的钱不计入余额，到账后一键写入流水。未到账 / 审核中计入合计；作废仅作标记、不计入合计，但保留记录可查。</div>
      <div class="pending-sum">
        待收合计 <b class="text-primary">{{ formatMoney(pendingTotal) }}</b>
        <StatusChip tone="info">{{ pendingOpen.length }} 项未到账 / 审核中</StatusChip>
      </div>
      <div class="table-scroll">
        <n-data-table
          :columns="pendingColumns" :data="pending" :row-props="pendingRowProps"
          :bordered="false" size="small" :scroll-x="860"
        />
      </div>
      <div class="row-add ledger-row">
        <n-input v-model:value="newPending.type" placeholder="项目（如 应届生社保补贴）" style="width:190px" />
        <n-input-number v-model:value="newPending.est_amount" placeholder="预估金额" :min="0" />
        <n-input v-model:value="newPending.condition" placeholder="到账条件（可选）" style="width:180px" />
        <n-button type="primary" :disabled="saving" @click="addPending">添加</n-button>
      </div>
      <!-- 编辑已有的待收项：金额待确认 / 录错时不必删了重建 -->
      <div v-if="editingPending.id" class="row-add ledger-row edit-pending">
        <span class="muted">编辑待收项</span>
        <n-input v-model:value="editingPending.type" placeholder="项目" style="width:190px" />
        <n-input-number v-model:value="editingPending.est_amount" placeholder="预估金额" :min="0" />
        <n-input v-model:value="editingPending.condition" placeholder="到账条件（可选）" style="width:180px" />
        <n-button type="primary" :disabled="saving" @click="updatePending">保存</n-button>
        <n-button :disabled="saving" @click="cancelEditPending">取消</n-button>
      </div>
    </SectionCard>

    <!-- 月度对账 -->
    <SectionCard class="led-recon" title="月度对账" icon="shieldCheck" desc="推演结余与实际流水逐笔比对">
      <div class="pt-note ledger-note">把「按档案推演的全月结余」与「实际已记账的流水」放在一起比对，找出漏记或配置偏差。</div>
      <div class="recon-tools">
        <span class="muted">期初余额（元）</span>
        <n-input-number v-model:value="reconcileStart" :min="0" size="small" style="width:140px" />
        <span class="muted">匹配容差（元）</span>
        <n-input-number v-model:value="reconcileTolerance" :min="0" :max="1000" size="small" style="width:110px" />
      </div>
      <div class="recon-grid">
        <div><span>预测月末结余</span><b>{{ formatMoney(predictedEnd) }}</b></div>
        <div><span>实际月末结余</span><b>{{ formatMoney(actualEnd) }}</b></div>
        <div><span>偏差（实际 − 预测）</span><b :class="reconDiff < 0 ? 'text-danger' : 'text-success'">{{ formatMoney(reconDiff) }}</b></div>
      </div>
      <div class="recon-verdict ledger-verdict" :class="reconLevel">{{ reconVerdict }}</div>
      <div v-if="unmatchedExpenses.length" class="recon-list">
        <div class="muted">以下预测支出在流水中没有对应记录（可能还没记账）：</div>
        <div v-for="(e, i) in unmatchedExpenses" :key="i" class="recon-item">
          {{ formatDateCN(e.date) }} · {{ e.label }} {{ formatMoney(Math.abs(e.amount)) }}
        </div>
      </div>
      <div class="pt-note ledger-note">
        口径：预测含发薪、固定开支与已录入还款；实际只统计所选月份的流水。工资到账若不单独记账，
        不计入上方「未匹配」清单。期初余额与仪表盘共用同一个值；金额在容差范围内即视为同一笔，
        容差同时用于偏差判定。当月未过完时存在偏差属正常。
      </div>
    </SectionCard>
  </div>
</template>

<script setup>
import { ref, reactive, computed, h, onMounted, onBeforeUnmount, watch } from 'vue'
import { useMessage, NButton } from 'naive-ui'
import { supabase } from '../lib/supabase'
import { subscribeFlowChange } from '../lib/flowChannel'
import { useAuthStore } from '../stores/auth'
import { useAppStore } from '../stores/app'
import { buildProjection } from '../composables/useProjection'
import { useBusy } from '../composables/useBusy'
import {
  DIRECTION_LABEL, SOURCE_LABEL, PENDING_STATUS_LABEL,
  formatDateCN, formatMoney
} from '../lib/labels'
import { toLocalISODate, todayISO, monthRangeISO } from '../lib/date'
import { validateTransaction, validatePendingIncome, round2 } from '../lib/validation'
import {
  readPref, writePref, readStartBalance, writeStartBalance,
  readCurrentBalance, writeCurrentBalance
} from '../lib/prefs'
import { DEFAULT_TOLERANCE, normalizeTolerance, findUnmatchedEvents } from '../lib/reconcile'
import { inferCategory, normalizeCategory } from '../lib/aiDraft'
import { habitOptions, learnFromRows, recordUsage } from '../lib/categoryHabits'

const message = useMessage()
const auth = useAuthStore()
const app = useAppStore()
// 写操作互斥锁：防连点产生重复流水
const { busy: saving, run } = useBusy((m) => message.error(m))
const rows = ref([])
const pending = ref([])
const selectedMonth = ref(Date.now())
const keyword = ref('')
const form = reactive({ date: Date.now(), direction: 'expense', category: '', amount: 0, note: '' })

// 备注里写了「午饭 / 打车」等就自动带出分类；只在用户没填分类时生效，不覆盖手填值
watch(() => form.note, (v) => {
  if (!String(form.category || '').trim()) {
    const guess = inferCategory(v, habitOptions())
    if (guess) form.category = guess
  }
})
const newPending = reactive({ type: '', est_amount: 0, condition: '' })
// 待收项行内编辑：金额待确认 / 录错时不必删了重建（修复 est_amount 为空的死数据）
const editingPending = reactive({ id: null, type: '', est_amount: 0, condition: '' })
function startEditPending(row) {
  Object.assign(editingPending, {
    id: row.id,
    type: row.type || '',
    est_amount: Number(row.est_amount) || 0,
    condition: row.condition || ''
  })
}
function cancelEditPending() { editingPending.id = null }

// 流水行内编辑
const editingTxn = reactive({ id: null, date: null, direction: 'expense', category: '', amount: 0, note: '' })
function startEditTxn(row) {
  Object.assign(editingTxn, {
    id: row.id,
    date: row.txn_date ? new Date(`${row.txn_date}T00:00:00`).getTime() : null,
    direction: row.direction || 'expense',
    category: row.category || '',
    amount: Number(row.amount) || 0,
    note: row.note || ''
  })
}
function cancelEditTxn() { editingTxn.id = null }
const directionOptions = [
  { label: '支出', value: 'expense' },
  { label: '收入', value: 'income' }
]

const viewDate = computed(() => new Date(selectedMonth.value || Date.now()))
const viewYear = computed(() => viewDate.value.getFullYear())
const viewMonth = computed(() => viewDate.value.getMonth() + 1)
const monthTitle = computed(() => `${viewYear.value} 年 ${viewMonth.value} 月`)
const range = computed(() => monthRangeISO(viewYear.value, viewMonth.value))
const pad = (n) => String(n).padStart(2, '0')

const sum = (list) => round2(list.reduce((acc, r) => acc + (Number(r.amount) || 0), 0))
const monthIncome = computed(() => sum(rows.value.filter((r) => r.direction === 'income')))
const monthExpense = computed(() => sum(rows.value.filter((r) => r.direction === 'expense')))
const monthNet = computed(() => round2(monthIncome.value - monthExpense.value))
const pendingOpen = computed(() => pending.value.filter((p) => p.status === 'unreceived' || p.status === 'reviewing'))
const pendingTotal = computed(() => sum(pendingOpen.value.map((p) => ({ amount: p.est_amount }))))

const filteredRows = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  if (!kw) return rows.value
  return rows.value.filter((r) =>
    String(r.category || '').toLowerCase().includes(kw) ||
    String(r.note || '').toLowerCase().includes(kw) ||
    String(r.amount || '').includes(kw)
  )
})

// 对账：与仪表盘共用同一推演入口与同一个期初余额，保证预测值只有一个版本
const reconcileStart = ref(readStartBalance())
const reconcileTolerance = ref(readPref('reconcileTolerance', DEFAULT_TOLERANCE))
const tolerance = computed(() => normalizeTolerance(reconcileTolerance.value))
const prefRevision = ref(0)
let unsubFlow = null
const onPrefChange = () => {
  prefRevision.value++
  // 另一个页面 / 标签页改了期初余额，这里同步，避免两处基准不一致
  const shared = readStartBalance()
  if (Math.abs(shared - Number(reconcileStart.value)) > 0.001) reconcileStart.value = shared
}
const projection = computed(() => {
  void prefRevision.value
  return buildProjection({
    app,
    startBalance: Number(reconcileStart.value) || 0,
    year: viewYear.value,
    month: viewMonth.value,
    months: 1
  })
})
const predictedEnd = computed(() => projection.value.cf.monthEnd)
const actualEnd = computed(() => round2((Number(reconcileStart.value) || 0) + monthNet.value))
const reconDiff = computed(() => round2(actualEnd.value - predictedEnd.value))
const reconLevel = computed(() => Math.abs(reconDiff.value) <= tolerance.value
  ? 'lv-ok' : reconDiff.value > 0 ? 'lv-plus' : 'lv-minus')
const reconVerdict = computed(() => {
  if (!rows.value.length) return `${monthTitle.value}还没有流水记录，先记几笔就能开始对账。`
  if (Math.abs(reconDiff.value) <= tolerance.value) {
    return `基本吻合：实际与预测的偏差在 ${formatMoney(tolerance.value)} 容差内。`
  }
  if (reconDiff.value > 0) return `实际比预测多 ${formatMoney(reconDiff.value)}：可能有未录入的收入，或实际开支低于档案配置。`
  return `实际比预测少 ${formatMoney(Math.abs(reconDiff.value))}：可能有未记账的支出，或还款金额与配置不符。`
})
const unmatchedExpenses = computed(() => findUnmatchedEvents(
  projection.value.cf.events,
  rows.value,
  range.value.start.slice(0, 7),
  tolerance.value
))

const categoryRows = computed(() => {
  const map = {}
  rows.value.filter((r) => r.direction === 'expense').forEach((r) => {
    const key = r.category || '未分类'
    map[key] = (map[key] || 0) + (Number(r.amount) || 0)
  })
  const list = Object.entries(map).map(([name, amount]) => ({ name, amount: round2(amount) }))
  const max = Math.max(1, ...list.map((x) => x.amount))
  return list.sort((a, b) => b.amount - a.amount).slice(0, 6)
    .map((x) => ({ ...x, percent: Math.max(4, Math.round((x.amount / max) * 100)) }))
})

const columns = [
  { title: '日期', key: 'txn_date', width: 110, render: (r) => formatDateCN(r.txn_date) },
  { title: '方向', key: 'direction', width: 80, render: (r) => DIRECTION_LABEL[r.direction] || r.direction },
  { title: '分类', key: 'category', width: 120, render: (r) => r.category || '—' },
  {
    title: '金额', key: 'amount', width: 130,
    render: (r) => h('span', { class: r.direction === 'income' ? 'text-success' : 'text-danger' }, formatMoney(r.amount))
  },
  { title: '来源', key: 'source', width: 100, render: (r) => SOURCE_LABEL[r.source] || r.source || '—' },
  { title: '备注', key: 'note', width: 160, render: (r) => r.note || '—' },
  {
    title: '操作', key: 'action', width: 140,
    render: (row) => h('div', { class: 'ops' }, [
      h(NButton,
        { size: 'small', quaternary: true, disabled: saving.value, onClick: () => startEditTxn(row) },
        { default: () => '编辑' }),
      h(NButton,
        { size: 'small', quaternary: true, type: 'error', disabled: saving.value, onClick: () => del(row) },
        { default: () => '删除' })
    ])
  }
]

// 待收状态机：本页可写的状态仅这三个；received 必须走 markReceived() 两步事务补偿
const PENDING_EDITABLE_STATUS = ['unreceived', 'reviewing', 'void']
const pendingRowProps = (row) => row.status === 'void' ? { style: { opacity: '.55' } } : {}

const pendingColumns = [
  {
    title: '项目', key: 'type', width: 170,
    render: (r) => r.status === 'void'
      ? h('span', { class: 'void-text' }, r.type)
      : (r.type || '—')
  },
  { title: '预估金额', key: 'est_amount', width: 120, render: (r) => formatMoney(r.est_amount) },
  {
    title: '状态', key: 'status', width: 100,
    render: (r) => h('span', { class: r.status === 'void' ? 'muted' : '' }, PENDING_STATUS_LABEL[r.status] || r.status)
  },
  { title: '到账条件', key: 'condition', width: 160, render: (r) => r.condition || '—' },
  {
    title: '操作', key: 'action', width: 320,
    render: (row) => {
      const open = row.status === 'unreceived' || row.status === 'reviewing'
      const btns = []
      if (row.status !== 'received') {
        btns.push(h(NButton, {
          size: 'small', quaternary: true, disabled: saving.value,
          onClick: () => startEditPending(row)
        }, { default: () => '编辑' }))
      }
      if (open) {
        btns.push(h(NButton, {
          size: 'small', quaternary: true, type: 'primary', disabled: saving.value,
          onClick: () => markReceived(row)
        }, { default: () => '标记到账' }))
      }
      if (row.status === 'unreceived') {
        btns.push(h(NButton, {
          size: 'small', quaternary: true, disabled: saving.value,
          onClick: () => setPendingStatus(row, 'reviewing')
        }, { default: () => '标记审核中' }))
      }
      if (open) {
        btns.push(h(NButton, {
          size: 'small', quaternary: true, type: 'warning', disabled: saving.value,
          onClick: () => setPendingStatus(row, 'void')
        }, { default: () => '标记作废' }))
      }
      if (row.status === 'reviewing' || row.status === 'void') {
        btns.push(h(NButton, {
          size: 'small', quaternary: true, disabled: saving.value,
          onClick: () => setPendingStatus(row, 'unreceived')
        }, { default: () => '恢复未到账' }))
      }
      btns.push(h(NButton, {
        size: 'small', quaternary: true, type: 'error', disabled: saving.value,
        onClick: () => delPending(row)
      }, { default: () => '删除' }))
      return h('div', { class: 'ops' }, btns)
    }
  }
]

// CSV 单元格转义：双引号转义 + 阻断 Excel 公式注入
function csvCell(value) {
  const s = String(value ?? '')
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s
  return `"${safe.replace(/"/g, '""')}"`
}

function exportCsv() {
  const header = ['日期', '方向', '分类', '金额', '来源', '备注']
  const lines = filteredRows.value.map((r) => [
    r.txn_date, DIRECTION_LABEL[r.direction] || r.direction, r.category,
    r.amount, SOURCE_LABEL[r.source] || r.source, r.note
  ].map(csvCell).join(','))
  const blob = new Blob([`\uFEFF${header.map(csvCell).join(',')}\r\n${lines.join('\r\n')}`], {
    type: 'text/csv;charset=utf-8;'
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `现金流流水_${range.value.start.slice(0, 7)}.csv`
  a.click()
  URL.revokeObjectURL(url)
  message.success(`已导出 ${filteredRows.value.length} 条流水`)
}

let loadSeq = 0
async function load() {
  const seq = ++loadSeq
  await auth.ensureReady()
  const uid = auth.userId
  if (!uid) return
  await app.load()
  // 按所选月份查全量，不做 limit 截断：汇总与列表用同一份数据，绝不漏数
  const [txnRes, pendRes] = await Promise.all([
    supabase.from('transaction').select('*').eq('user_id', uid)
      .gte('txn_date', range.value.start).lte('txn_date', range.value.end)
      .order('txn_date', { ascending: false }),
    supabase.from('pending_income').select('*').eq('user_id', uid)
      .order('created_at', { ascending: false })
  ])
  // 快速切月时丢弃过期响应，避免旧月数据覆盖新月
  if (seq !== loadSeq) return
  const err = txnRes.error || pendRes.error
  if (err) return message.error(err.message)
  rows.value = txnRes.data || []
  // 复用已有查询结果导入历史分类习惯，不发额外请求
  learnFromRows(txnRes.data || [])
  pending.value = pendRes.data || []
  // 同步推演引擎的已记流水与待收上下文：仪表盘 / 日历 / AI 劝导随之更新
  // 同步失败不阻断账本渲染（预测会退回纯档案口径）
  try { await app.reloadTransactions() } catch { /* noop */ }
}

async function add() {
  const checked = validateTransaction({
    txn_date: toLocalISODate(form.date),
    direction: form.direction,
    category: normalizeCategory(form.category, form.note, habitOptions()),
    amount: form.amount,
    note: form.note,
    source: 'manual'
  })
  if (!checked.ok) return message.warning(checked.error)
  await auth.ensureReady()
  const uid = auth.userId
  if (!uid) return message.error('未登录')
  const ok = await run(async () => {
    const { error } = await supabase.from('transaction').insert({ user_id: uid, ...checked.value })
    if (error) throw error
    try {
      recordUsage(checked.value.category)
    } catch {
      // 习惯记忆失败不影响记账结果
    }
    Object.assign(form, { date: Date.now(), direction: 'expense', category: '', amount: 0, note: '' })
    await load()
  })
  if (ok) message.success('已记录')
}

async function updateTxn() {
  const row = rows.value.find((r) => r.id === editingTxn.id)
  if (!row) return
  const checked = validateTransaction({
    txn_date: toLocalISODate(editingTxn.date),
    direction: editingTxn.direction,
    category: normalizeCategory(editingTxn.category, editingTxn.note, habitOptions()),
    amount: editingTxn.amount,
    note: editingTxn.note,
    source: row.source || 'manual'
  })
  if (!checked.ok) return message.warning(checked.error)
  const ok = await run(async () => {
    const { error } = await supabase.from('transaction')
      .update(checked.value).eq('id', row.id)
    if (error) throw error
    editingTxn.id = null
    await load()
  })
  if (ok) message.success('已更新流水，推演与对账已同步重算')
}

async function del(row) {
  const ok = await run(async () => {
    const { error } = await supabase.from('transaction').delete().eq('id', row.id)
    if (error) throw error
    await load()
  })
  if (ok) message.success('已删除')
}

async function addPending() {
  const checked = validatePendingIncome(newPending)
  if (!checked.ok) return message.warning(checked.error)
  await auth.ensureReady()
  const uid = auth.userId
  if (!uid) return message.error('未登录')
  const ok = await run(async () => {
    const { error } = await supabase.from('pending_income').insert({ user_id: uid, ...checked.value })
    if (error) throw error
    Object.assign(newPending, { type: '', est_amount: 0, condition: '' })
    await load()
  })
  if (ok) message.success('已添加待收项')
}

async function updatePending() {
  const row = pending.value.find((p) => p.id === editingPending.id)
  if (!row) return
  // 复用同一校验层，status 显式保持当前值，避免绕过「到账」两步事务
  const checked = validatePendingIncome({ ...editingPending, status: row.status })
  if (!checked.ok) return message.warning(checked.error)
  const ok = await run(async () => {
    const { error } = await supabase.from('pending_income')
      .update(checked.value).eq('id', row.id)
    if (error) throw error
    editingPending.id = null
    await load()
  })
  if (ok) message.success('已更新待收项，可继续标记到账')
}

async function delPending(row) {
  const ok = await run(async () => {
    const { error } = await supabase.from('pending_income').delete().eq('id', row.id)
    if (error) throw error
    await load()
  })
  if (ok) message.success('已删除')
}

// 状态流转（审核中 / 作废 / 恢复）：只写 status，白名单显式排除 received，
// 避免绕过 markReceived() 的「写流水 + 改状态」两步补偿事务。
async function setPendingStatus(row, nextStatus) {
  if (!PENDING_EDITABLE_STATUS.includes(nextStatus)) {
    return message.error('状态不合法：已到账须走「标记到账」，不能绕过流水写入')
  }
  if (row.status === nextStatus) return
  const ok = await run(async () => {
    const { error } = await supabase.from('pending_income')
      .update({ status: nextStatus }).eq('id', row.id)
    if (error) throw error
    await load()
  })
  if (ok) message.success(`已标记为${PENDING_STATUS_LABEL[nextStatus] || nextStatus}`)
}

// 到账 = 写一笔收入流水 + 更新状态。第二步失败则撤销流水，保证不留半截数据
async function markReceived(row) {
  await auth.ensureReady()
  const uid = auth.userId
  if (!uid) return message.error('未登录')
  // 金额待确认（null / 0）时不再静默校验失败：明确引导先补金额
  const est = Number(row.est_amount)
  if (!Number.isFinite(est) || est <= 0) {
    return message.warning('这项还没有有效的预估金额，请先点「编辑」补上金额，再标记到账')
  }
  const checked = validateTransaction({
    txn_date: todayISO(), direction: 'income', category: row.type,
    amount: est, note: row.condition || '待收收入到账', source: 'manual'
  })
  if (!checked.ok) return message.warning(checked.error)
  const ok = await run(async () => {
    const { data: inserted, error: insErr } = await supabase
      .from('transaction').insert({ user_id: uid, ...checked.value }).select().single()
    if (insErr) throw insErr
    const { error: upErr } = await supabase
      .from('pending_income').update({ status: 'received' }).eq('id', row.id)
    if (upErr) {
      await supabase.from('transaction').delete().eq('id', inserted.id)
      throw new Error(`状态更新失败，已撤销流水：${upErr.message}`)
    }
    // FR-11：到账后真实余额台账同步增加，仪表盘「现在还剩」与台账一起更新
    try {
      const cur = readCurrentBalance().value
      if (cur != null) {
        writeCurrentBalance(round2(cur + checked.value.amount), {
          reason: `待收「${row.type}」到账`
        })
      }
    } catch {
      // 余额台账更新失败不影响到账主流程（流水与状态已写入）
    }
    await load()
  })
  if (ok) message.success('已到账并写入流水')
}

watch(selectedMonth, () => load())
watch(reconcileStart, (v) => writeStartBalance(v))
watch(reconcileTolerance, (v) => writePref('reconcileTolerance', normalizeTolerance(v)))

onMounted(() => {
  window.addEventListener('paytrace:pref-changed', onPrefChange)
  window.addEventListener('storage', onPrefChange)
  unsubFlow = subscribeFlowChange(() => {
    app.reloadTransactions({ silent: true }).catch(() => {})
    load()
  })
  load()
})
onBeforeUnmount(() => {
  window.removeEventListener('paytrace:pref-changed', onPrefChange)
  window.removeEventListener('storage', onPrefChange)
  unsubFlow?.()
})
</script>

<style scoped>
/* ===== 工作台骨架：左对齐页身份，区别于其他页的居中页头 ===== */
.led-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
  flex-wrap: wrap;
  margin-bottom: 18px;
}
.led-eyebrow {
  display: inline-block;
  font-size: var(--fs-caption);
  letter-spacing: .14em;
  color: var(--c-primary);
  margin-bottom: 6px;
}
.led-title {
  font-size: var(--fs-display);
  font-weight: 700;
  line-height: 1.08;
  margin: 0;
  color: var(--c-text);
}
.led-desc {
  margin: 8px 0 0;
  max-width: 58ch;
  font-size: var(--fs-body);
  color: var(--c-text-2);
  line-height: 1.6;
}
.led-head-side { flex-shrink: 0; }

/* ===== 命令栏：月份 + 搜索，常驻工作台顶部 ===== */
.led-bar {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  align-items: flex-end;
  padding: 14px 16px;
  background: var(--c-surface);
  border: 1px solid var(--c-border);
  border-radius: 12px;
  margin-bottom: 14px;
}
.led-bar-field { display: flex; flex-direction: column; gap: 6px; }
.led-bar-field.grow { flex: 1 1 280px; min-width: 220px; }
.led-bar-label { font-size: var(--fs-caption); color: var(--c-text-2); }

/* ===== 记一笔：全页唯一强调区（accent 表面）===== */
.led-add {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding: 12px 16px;
  background: var(--c-primary-soft);
  border: 1px solid var(--c-primary-soft-2);
  border-radius: 12px;
  margin-bottom: 18px;
}
.led-add-kicker {
  font-size: var(--fs-section);
  font-weight: 700;
  color: var(--c-primary-ink);
  margin-right: 4px;
}

/* ===== 本月三数 ===== */
.led-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14px;
  margin-bottom: 18px;
}

/* ===== 主工作区：左流水（主）/ 右支出构成（次）===== */
.led-split {
  display: grid;
  grid-template-columns: 1.9fr 1fr;
  gap: 16px;
  align-items: start;
  margin-bottom: 18px;
}
.led-pending,
.led-recon { margin-bottom: 18px; }
.led-hint { font-size: var(--fs-caption); }

/* ===== 复用：待收表格里的删除线与操作按钮组 ===== */
.void-text { text-decoration: line-through; }
.ops { display: flex; flex-wrap: wrap; gap: 6px; }

/* 对账结论：状态底色统一走语义 token */
.ledger-verdict.lv-ok { color: var(--c-success); background: var(--c-success-soft); }
.ledger-verdict.lv-plus { color: var(--c-primary); background: var(--c-primary-soft); }
.ledger-verdict.lv-minus { color: var(--c-danger); background: var(--c-danger-soft); }

.ledger-note { font-size: var(--fs-caption); }
.ledger-hint { font-size: var(--fs-caption); }

@media (max-width: 960px) {
  .led-split { grid-template-columns: 1fr; }
  .led-split > * { min-width: 0; }
}
@media (max-width: 768px) {
  .led-stats { grid-template-columns: 1fr; }
  .ledger-row > * { flex: 1 1 140px; }
  .ledger-note { font-size: var(--fs-micro); }
  .ledger-hint { font-size: var(--fs-micro); }
  .ledger-verdict { font-size: var(--fs-caption); }
}
</style>
