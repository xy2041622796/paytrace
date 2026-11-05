<template>
  <div class="ledger">
    <h2 class="page-title">流水账本</h2>
    <p class="muted intro">记录每一笔收支，智能记账写入的流水也会汇总到这里。数据仅本人可见。</p>

    <!-- 月份与搜索 -->
    <div class="toolbar card">
      <div class="tool-item">
        <div class="field-label">查看月份</div>
        <n-date-picker v-model:value="selectedMonth" type="month" clearable="false" style="width:150px" />
      </div>
      <div class="tool-item grow">
        <div class="field-label">搜索分类 / 备注 / 金额</div>
        <n-input v-model:value="keyword" placeholder="如 餐饮、房租、45" clearable />
      </div>
      <div class="tool-count muted">{{ filteredRows.length }} / {{ rows.length }} 条</div>
    </div>

    <!-- 选中月份汇总 -->
    <div class="stats">
      <div class="stat card">
        <div class="stat-label">{{ monthTitle }}收入</div>
        <div class="stat-value text-success">{{ formatMoney(monthIncome) }}</div>
      </div>
      <div class="stat card">
        <div class="stat-label">{{ monthTitle }}支出</div>
        <div class="stat-value text-danger">{{ formatMoney(monthExpense) }}</div>
      </div>
      <div class="stat card">
        <div class="stat-label">{{ monthTitle }}净额</div>
        <div class="stat-value" :class="monthNet < 0 ? 'text-danger' : 'text-primary'">{{ formatMoney(monthNet) }}</div>
      </div>
    </div>

    <!-- 支出构成 -->
    <n-card title="支出构成" class="block">
      <div v-if="!categoryRows.length" class="muted">这个月还没有支出流水。</div>
      <div v-for="c in categoryRows" :key="c.name" class="cat-row">
        <span class="cat-name">{{ c.name }}</span>
        <div class="cat-track"><div class="cat-fill" :style="{ width: c.percent + '%' }" /></div>
        <span class="cat-amount">{{ formatMoney(c.amount) }}</span>
      </div>
    </n-card>

    <!-- 待收收入 -->
    <n-card title="待收收入" class="block">
      <p class="muted">奖金、补贴等尚未到账的钱不计入余额，到账后一键写入流水。未到账 / 审核中计入合计；作废仅作标记、不计入合计，但保留记录可查。</p>
      <div class="pending-sum">
        待收合计 <b class="text-primary">{{ formatMoney(pendingTotal) }}</b>
        <span class="muted">（{{ pendingOpen.length }} 项未到账 / 审核中）</span>
      </div>
      <div class="table-scroll">
        <n-data-table
          :columns="pendingColumns" :data="pending" :row-props="pendingRowProps"
          :bordered="false" size="small" :scroll-x="860"
        />
      </div>
      <div class="row-add">
        <n-input v-model:value="newPending.type" placeholder="项目（如 应届生社保补贴）" style="width:190px" />
        <n-input-number v-model:value="newPending.est_amount" placeholder="预估金额" :min="0" />
        <n-input v-model:value="newPending.condition" placeholder="到账条件（可选）" style="width:180px" />
        <n-button type="primary" :disabled="saving" @click="addPending">添加</n-button>
      </div>
    </n-card>

    <!-- 手动记一笔 -->
    <n-card title="记一笔" class="block">
      <div class="add-row">
        <n-date-picker v-model:value="form.date" type="date" clearable placeholder="日期" style="width:160px" />
        <n-select v-model:value="form.direction" :options="directionOptions" style="width:110px" />
        <n-input v-model:value="form.category" placeholder="分类（如 餐饮）" style="width:150px" />
        <n-input-number v-model:value="form.amount" :min="0" placeholder="金额" style="width:130px" />
        <n-input v-model:value="form.note" placeholder="备注（可选）" style="width:170px" />
        <n-button type="primary" :loading="saving" :disabled="saving" @click="add">保存</n-button>
      </div>
    </n-card>

    <!-- 流水列表 -->
    <n-card :title="`${monthTitle}流水`" class="block">
      <div class="table-scroll">
        <n-data-table :columns="columns" :data="filteredRows" :bordered="false" size="small" :scroll-x="720" />
      </div>
      <div class="export-row">
        <n-button size="small" :disabled="!filteredRows.length || saving" @click="exportCsv">导出为表格文件</n-button>
        <span class="muted">导出当前搜索结果为 CSV，可用 Excel / WPS 打开。</span>
      </div>
    </n-card>

    <!-- 月度对账 -->
    <n-card title="月度对账" class="block">
      <p class="muted fold-tip">把「按档案推演的全月结余」与「实际已记账的流水」放在一起比对，找出漏记或配置偏差。</p>
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
      <div class="recon-verdict" :class="reconLevel">{{ reconVerdict }}</div>
      <div v-if="unmatchedExpenses.length" class="recon-list">
        <div class="muted">以下预测支出在流水中没有对应记录（可能还没记账）：</div>
        <div v-for="(e, i) in unmatchedExpenses" :key="i" class="recon-item">
          {{ formatDateCN(e.date) }} · {{ e.label }} {{ formatMoney(Math.abs(e.amount)) }}
        </div>
      </div>
      <p class="muted fold-tip">
        口径：预测含发薪、固定开支与已录入还款；实际只统计所选月份的流水。工资到账若不单独记账，
        不计入上方「未匹配」清单。期初余额与仪表盘共用同一个值；金额在容差范围内即视为同一笔，
        容差同时用于偏差判定。当月未过完时存在偏差属正常。
      </p>
    </n-card>
  </div>
</template>

<script setup>
import { ref, reactive, computed, h, onMounted, onBeforeUnmount, watch } from 'vue'
import { useMessage, NButton } from 'naive-ui'
import { supabase } from '../lib/supabase'
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
import { readPref, writePref, readStartBalance, writeStartBalance } from '../lib/prefs'
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
    title: '操作', key: 'action', width: 90,
    render: (row) => h(NButton,
      { size: 'small', quaternary: true, type: 'error', disabled: saving.value, onClick: () => del(row) },
      { default: () => '删除' })
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
  const checked = validateTransaction({
    txn_date: todayISO(), direction: 'income', category: row.type,
    amount: row.est_amount, note: row.condition || '待收收入到账', source: 'manual'
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
  load()
})
onBeforeUnmount(() => {
  window.removeEventListener('paytrace:pref-changed', onPrefChange)
  window.removeEventListener('storage', onPrefChange)
})
</script>

<style scoped>
.page-title { font-size: 20px; font-weight: 600; margin: 0 0 4px; }
.intro { line-height: 1.7; margin-bottom: 14px; }
.toolbar { display: flex; gap: 16px; align-items: flex-end; flex-wrap: wrap; margin: 14px 0; }
.tool-item { display: flex; flex-direction: column; gap: 6px; }
.tool-item.grow { flex: 1 1 200px; }
.tool-count { font-size: 12px; padding-bottom: 4px; }
.stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin: 14px 0; }
.stat-label { font-size: 12px; color: var(--c-text-2); margin-bottom: 8px; }
.stat-value { font-size: 19px; font-weight: 600; word-break: break-all; }
.block { margin-bottom: 16px; }
.pending-sum { margin: 10px 0 12px; font-size: 14px; }
.pending-sum .muted { font-size: 12px; }
.void-text { text-decoration: line-through; }
.cat-row { display: flex; align-items: center; gap: 12px; padding: 7px 0; font-size: 13px; }
.cat-name { width: 96px; flex-shrink: 0; color: var(--c-text-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cat-track { flex: 1; height: 9px; border-radius: 5px; background: var(--c-hover); overflow: hidden; min-width: 40px; }
.cat-fill { height: 100%; border-radius: 5px; background: var(--c-primary); }
.cat-amount { width: 110px; text-align: right; flex-shrink: 0; }
.add-row, .row-add { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-top: 14px; }
.table-scroll { overflow-x: auto; }
.export-row { display: flex; align-items: center; gap: 12px; margin-top: 14px; flex-wrap: wrap; }
.export-row .muted { font-size: 12px; }
.fold-tip { font-size: 12px; line-height: 1.7; }

.recon-tools { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin: 14px 0; }
.recon-tools .muted { font-size: 12px; }
.recon-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
.recon-grid > div { padding: 10px; border: 1px solid var(--c-border); border-radius: var(--radius-sm); }
.recon-grid span { display: block; font-size: 12px; color: var(--c-text-2); margin-bottom: 6px; }
.recon-grid b { font-size: 16px; word-break: break-all; }
.recon-verdict { margin-top: 12px; padding: 10px 12px; border-radius: var(--radius-sm); font-size: 13px; line-height: 1.6; }
.recon-verdict.lv-ok { color: var(--c-success); background: rgba(16, 185, 129, .12); }
.recon-verdict.lv-plus { color: var(--c-primary); background: var(--c-primary-soft); }
.recon-verdict.lv-minus { color: var(--c-danger); background: rgba(239, 68, 68, .12); }
.recon-list { margin-top: 12px; }
.recon-item { font-size: 12px; color: var(--c-text-2); padding: 4px 0; }

@media (max-width: 768px) {
  .stats { grid-template-columns: repeat(3, 1fr); gap: 8px; }
  .stat-value { font-size: 15px; }
  .add-row > *, .row-add > * { flex: 1 1 140px; }
  .cat-name { width: 72px; }
  .cat-amount { width: 92px; }
  .recon-grid { grid-template-columns: 1fr; }
  .toolbar { gap: 10px; }
}
</style>
