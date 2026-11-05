<template>
  <div class="ai">
    <h2 class="page-title">智能记账与消费劝导</h2>
    <p class="muted">
      由智能模型解析，调用密钥只保存在服务端，页面不会接触。
      解析结果只是草稿，逐条确认后才会写入流水。建议与提醒仅供参考，不构成财务建议，也不承诺任何收益。
    </p>

    <n-tabs type="line" animated>
      <!-- 大白话记账 -->
      <n-tab-pane name="note" tab="大白话记账">
        <n-input
          v-model:value="noteText"
          type="textarea"
          :rows="3"
          placeholder="用大白话描述，可以一次说多笔：例如「昨天中午快餐45，打车23，晚上买水3块」"
        />
        <n-button type="primary" class="act" :loading="parsing" @click="parseNote">智能解析</n-button>

        <div v-if="drafts.length" class="draft-wrap">
          <div class="draft-bar">
            <b>待确认清单（{{ drafts.length }} 笔）</b>
            <span class="muted">已勾选 {{ selectedCount }} 笔 · 可写 {{ writableCount }} 笔</span>
            <div class="bar-actions">
              <n-button size="small" @click="addBlank">添加一笔</n-button>
              <n-button size="small" @click="toggleAll">{{ allSelected ? '取消全选' : '全选' }}</n-button>
              <n-button size="small" quaternary type="error" @click="askClear">
                {{ clearArmed ? '确认清空？' : '清空清单' }}
              </n-button>
            </div>
          </div>

          <div v-for="(d, i) in drafts" :key="d.id" class="draft card" :class="{ 'is-off': !d.selected }">
            <div class="draft-head">
              <label class="pick">
                <input v-model="d.selected" type="checkbox" />
                <span>第 {{ i + 1 }} 笔</span>
              </label>
              <span class="src-tag" :class="d.source === 'ai' ? 'src-ai' : 'src-manual'">
                {{ d.source === 'ai' ? '智能解析' : '手动添加' }}
              </span>
              <span v-if="isLowConfidence(d)" class="src-tag src-low">置信度偏低，请核对</span>
              <n-button size="tiny" quaternary type="error" @click="removeDraft(d.id)">删除</n-button>
            </div>

            <div v-if="draftError(d)" class="draft-err">{{ draftError(d) }}</div>

            <div class="edit-grid">
              <label class="fld">
                <span>日期</span>
                <input v-model="d.txn_date" type="date" />
              </label>
              <label class="fld">
                <span>收支方向</span>
                <n-select v-model:value="d.direction" :options="directionOptions" size="small" />
              </label>
              <label class="fld">
                <span>分类</span>
                <n-input v-model:value="d.category" size="small" placeholder="如 餐饮" />
              </label>
              <label class="fld">
                <span>金额（元）</span>
                <n-input-number v-model:value="d.amount" :min="0" :step="0.01" size="small" placeholder="0.00" />
              </label>
              <label class="fld fld-wide">
                <span>备注</span>
                <n-input v-model:value="d.note" size="small" placeholder="可留空" />
              </label>
            </div>

            <div class="draft-foot">
              <span class="muted">金额：{{ formatMoney(Number(d.amount) || 0) }}</span>
              <n-button size="small" type="primary" :disabled="!canWrite(d)" :loading="busy" @click="writeDrafts(d.id)">
                写入这一笔
              </n-button>
            </div>
          </div>

          <div class="draft-submit">
            <n-button type="primary" :disabled="!writableCount" :loading="busy" @click="writeDrafts()">
              写入选中项（{{ writableCount }} 笔）
            </n-button>
            <span class="muted">只有校验通过的条目才会写入；未写入的草稿会留在清单里。</span>
          </div>
        </div>

        <div v-else class="empty card">
          还没有草稿。输入一段大白话点「智能解析」，或点下方按钮手动记一笔。
        </div>
        <div class="below">
          <n-button size="small" @click="addBlank">手动添加一笔</n-button>
        </div>
        <p class="disclaimer">以上解析结果仅为草稿，须经你确认写入；不构成财务建议，也不承诺任何收益。</p>
      </n-tab-pane>

      <!-- 购物劝导 -->
      <n-tab-pane name="advise" tab="购物劝导">
        <n-input
          v-model:value="buyText"
          type="textarea"
          :rows="2"
          placeholder="想买什么：例如「想买一双跑步鞋 399 元」"
        />
        <n-button type="primary" class="act" :loading="advising" @click="advise">帮我判断</n-button>

        <div v-if="advice" class="result card">
          <div class="row"><span>建议</span><b :class="adviceClass">{{ adviceLabel }}</b></div>
          <div class="row"><span>理由</span><b>{{ advice.reason }}</b></div>
          <div class="row"><span>风险等级</span><b>{{ advice.risk_level }}</b></div>
          <div class="disclaimer">{{ advice.disclaimer || '以上仅为消费提醒，不构成财务建议。' }}</div>
        </div>
      </n-tab-pane>
    </n-tabs>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useMessage } from 'naive-ui'
import { supabase, callAgnes } from '../lib/supabase'
import { useAuthStore } from '../stores/auth'
import { useAppStore } from '../stores/app'
import { buildProjection } from '../composables/useProjection'
import { formatMoney } from '../lib/labels'
import { SAFETY_LINE } from '../lib/constants'
import { readStartBalance, readRecurringRepayment } from '../lib/prefs'
import { useBusy } from '../composables/useBusy'
import {
  makeBlankDraft, normalizeAiResult, isLowConfidence,
  validateDraft, collectWritable
} from '../lib/aiDraft'

const message = useMessage()
const auth = useAuthStore()
const app = useAppStore()
// 写操作互斥锁：单条与批量共用，防连点重复插入
const { busy, run } = useBusy((m) => message.error(m))

const noteText = ref('')
const buyText = ref('')
const parsing = ref(false)
const advising = ref(false)
const drafts = ref([])
const advice = ref(null)
const clearArmed = ref(false)
const directionOptions = [
  { label: '支出', value: 'expense' },
  { label: '收入', value: 'income' }
]

const selectedCount = computed(() => drafts.value.filter((d) => d.selected).length)
const allSelected = computed(() => drafts.value.length > 0 && selectedCount.value === drafts.value.length)
// 每条草稿实时校验，错误直接显示在卡片上；写入时再统一过一次校验层
const checkedMap = computed(() => {
  const map = {}
  drafts.value.forEach((d) => { map[d.id] = validateDraft(d) })
  return map
})
const writableCount = computed(() =>
  drafts.value.filter((d) => d.selected && checkedMap.value[d.id]?.ok).length
)
const draftError = (d) => checkedMap.value[d.id]?.ok ? '' : checkedMap.value[d.id]?.error
const canWrite = (d) => !!checkedMap.value[d.id]?.ok

const adviceLabel = computed(() => {
  const m = { 劝买: '可以买', 劝缓: '建议缓一缓', 劝不买: '暂时别买', 中性: '中性' }
  return m[advice.value?.advice] || advice.value?.advice || ''
})
const adviceClass = computed(() => {
  const a = advice.value?.advice
  if (a === '劝不买') return 'text-danger'
  if (a === '劝缓') return 'text-warning'
  if (a === '劝买') return 'text-success'
  return ''
})

async function parseNote() {
  if (!noteText.value.trim()) return message.warning('先描述一下吧')
  parsing.value = true
  try {
    const res = await callAgnes('parse_note', { text: noteText.value })
    const items = normalizeAiResult(res)
    if (!items.length) return message.warning('没解析出可用的账目，换个说法试试')
    // 追加而非替换：绝不覆盖用户已经编辑过的草稿
    drafts.value = [...drafts.value, ...items]
    message.success(`新增 ${items.length} 笔草稿，请逐条核对`)
  } catch (e) {
    message.error(e.message || '解析失败，请稍后重试')
  } finally {
    parsing.value = false
  }
}

function addBlank() {
  drafts.value = [...drafts.value, makeBlankDraft()]
}
function removeDraft(id) {
  drafts.value = drafts.value.filter((d) => d.id !== id)
}
function toggleAll() {
  const next = !allSelected.value
  drafts.value.forEach((d) => { d.selected = next })
}
function askClear() {
  if (!clearArmed.value) {
    clearArmed.value = true
    setTimeout(() => { clearArmed.value = false }, 4000)
    return
  }
  drafts.value = []
  clearArmed.value = false
}

// 单条与批量共用同一套校验；一次 insert 数组，失败则整批不落库
async function writeDrafts(onlyId = null) {
  const { writable, invalid } = collectWritable(drafts.value, onlyId)
  if (!writable.length) return message.warning(invalid[0]?.error || '没有可写入的条目')
  if (!onlyId && invalid.length) message.warning(`有 ${invalid.length} 笔未通过校验，已跳过`)
  await auth.ensureReady()
  const userId = auth.userId
  if (!userId) return message.error('未登录')
  await run(async () => {
    const { error } = await supabase.from('transaction').insert(
      writable.map((w) => ({ user_id: userId, ...w.value }))
    )
    if (error) throw new Error(error.message)
    const done = new Set(writable.map((w) => w.id))
    drafts.value = drafts.value.filter((d) => !done.has(d.id))
    message.success(`已写入 ${writable.length} 笔流水`)
  })
}

// 购物劝导的真实财务上下文：统一推演入口 + 本机档案，纯计算、不写库、不发额外请求
function buildFinancialContext() {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  const p = buildProjection({
    app,
    startBalance: readStartBalance(),
    recurringRepayment: readRecurringRepayment(),
    year,
    month
  })
  const cf = p.cf
  const ym = `${year}-${String(month).padStart(2, '0')}`
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // 当月还款清单：日期 + 金额 + 距今天数，便于模型判断「近 7 天大额还款」
  const upcomingRepayments = (app.repayments || [])
    .filter((r) => String(r.due_date || '').startsWith(ym))
    .map((r) => {
      const due = new Date(`${r.due_date}T00:00:00`)
      const daysFromToday = Number.isNaN(due.getTime())
        ? null
        : Math.round((due - today) / 86400000)
      return { date: r.due_date, amount: Number(r.amount) || 0, daysFromToday }
    })
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))

  const todayBalance = cf.daily?.[now.getDate() - 1]?.balance
  return {
    year,
    month,
    currency: 'CNY',
    currentBalance: Number.isFinite(todayBalance) ? todayBalance : readStartBalance(),
    monthMinBalance: cf.monthMin,
    monthEndBalance: cf.monthEnd,
    negativeFromDay: cf.negativeFrom, // null 表示当月现金不会转负
    monthlyNetSalary: p.netNow.net,
    upcomingRepayments,
    topRisks: (cf.warnings || []).slice(0, 3)
      .map((w) => ({ title: w.title, detail: w.detail })),
    safetyLine: SAFETY_LINE
  }
}

async function advise() {
  if (!buyText.value) return message.warning('先说想买啥')
  advising.value = true
  advice.value = null
  try {
    await auth.ensureReady()
    await app.load()
    const context = buildFinancialContext()
    const res = await callAgnes('advise_purchase', {
      text: buyText.value,
      context
    })
    advice.value = res.result
  } catch (e) {
    message.error(e.message || '分析失败，请稍后重试')
  } finally {
    advising.value = false
  }
}
</script>

<style scoped>
.page-title { font-size: 20px; font-weight: 600; margin: 0 0 4px; }
.act { margin: 12px 0; }
.draft-bar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin: 4px 0 12px; }
.draft-bar .muted { font-size: 12px; }
.bar-actions { display: flex; gap: 6px; flex-wrap: wrap; margin-left: auto; }
.draft { margin-bottom: 12px; padding: 12px 14px; }
.draft.is-off { opacity: .62; }
.draft-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 10px; }
.pick { display: flex; align-items: center; gap: 6px; font-size: 13px; cursor: pointer; }
.pick input { accent-color: var(--c-primary, #FF6B35); }
.src-tag { font-size: 11px; padding: 2px 8px; border-radius: 4px; background: var(--c-hover); color: var(--c-text-2); }
.src-ai { color: var(--c-success, #10B981); }
.src-low { color: var(--c-warning); background: rgba(245, 158, 11, .14); }
.draft-err { color: var(--c-danger); font-size: 12px; margin-bottom: 8px; }
.edit-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.fld { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.fld > span { font-size: 12px; color: var(--c-text-2); }
.fld input[type="date"] {
  width: 100%; box-sizing: border-box; padding: 5px 8px;
  border: 1px solid var(--c-border); border-radius: 6px;
  background: var(--c-card, transparent); color: var(--c-text, inherit); font-size: 13px;
}
.fld-wide { grid-column: 1 / -1; }
.draft-foot { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-top: 10px; }
.draft-submit { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-top: 6px; }
.draft-submit .muted { font-size: 12px; }
.empty { margin-top: 12px; padding: 16px; font-size: 13px; color: var(--c-text-2); }
.below { margin-top: 10px; }
.result { margin-top: 12px; }
.row {
  display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap;
  padding: 6px 0; border-bottom: 1px solid var(--c-border); font-size: 14px;
}
.row span { color: var(--c-text-2); }
.row b { text-align: right; word-break: break-all; }
.text-warning { color: var(--c-warning); }
.disclaimer { color: var(--c-text-3); font-size: 12px; margin-top: 10px; line-height: 1.6; }

@media (max-width: 768px) {
  .row b { text-align: left; width: 100%; }
  .act { width: 100%; }
  .edit-grid { grid-template-columns: 1fr; }
  .bar-actions { margin-left: 0; width: 100%; }
}
</style>
