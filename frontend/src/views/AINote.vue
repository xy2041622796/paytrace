<template>
  <div class="ai pt-page">
    <!-- 页身份：左对齐，与仪表盘/日历的页头刻意不同（更克制，像工具入口） -->
    <header class="ai-head">
      <div class="ai-id">
        <span class="ai-eyebrow">记录 · 工具台</span>
        <h1 class="ai-title">智能记账与消费劝导</h1>
      </div>
      <p class="ai-desc muted">由智能模型解析，调用密钥只保存在服务端，页面不会接触。解析结果只是草稿，逐条确认后才会写入流水。建议与提醒仅供参考，不构成财务建议，也不承诺任何收益。</p>
    </header>

    <!-- 双栏工具台：左大白话记账，右购物劝导 —— 不用 tab，两件事并排摆开 -->
    <div class="ai-bench">
      <!-- 大白话记账 -->
      <section class="ai-tool">
        <div class="tool-head">
          <span class="tool-ico"><AppIcon name="sparkles" :size="18" /></span>
          <div>
            <b>大白话记账</b>
            <span class="tool-sub">一次可描述多笔收支，解析结果只作草稿</span>
          </div>
        </div>
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
            <span class="muted hint">已勾选 {{ selectedCount }} 笔 · 可写 {{ writableCount }} 笔</span>
            <div class="bar-actions draft-actions">
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
              <span v-if="d.dateAdjusted" class="src-tag src-low">日期已修正，请核对</span>
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
                <n-input v-model:value="d.category" size="small" placeholder="自动识别，可修改" />
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
              <span class="muted hint">金额：{{ formatMoney(Number(d.amount) || 0) }}</span>
              <n-button size="small" type="primary" :disabled="!canWrite(d)" :loading="busy" @click="writeDrafts(d.id)">
                写入这一笔
              </n-button>
            </div>
          </div>

          <div class="draft-submit">
            <n-button type="primary" :disabled="!writableCount" :loading="busy" @click="writeDrafts()">
              写入选中项（{{ writableCount }} 笔）
            </n-button>
            <span class="muted hint">只有校验通过的条目才会写入；未写入的草稿会留在清单里。</span>
          </div>
        </div>

        <EmptyState v-else icon="inbox">还没有草稿。输入一段大白话点「智能解析」，或点下方按钮手动记一笔。</EmptyState>

        <p v-if="degradedHint" class="disclaimer" style="color:var(--c-warning,#f0a020)">{{ degradedHint }}，可点下方「手动添加一笔」补录。</p>
        <div class="below">
          <n-button size="small" @click="addBlank">手动添加一笔</n-button>
        </div>
        <p class="disclaimer">以上解析结果仅为草稿，须经你确认写入；不构成财务建议，也不承诺任何收益。</p>
      </section>

      <!-- 购物劝导 -->
      <section class="ai-tool">
        <div class="tool-head">
          <span class="tool-ico"><AppIcon name="bulb" :size="18" /></span>
          <div>
            <b>购物劝导</b>
            <span class="tool-sub">结合当月现金流与还款安排给出消费提醒</span>
          </div>
        </div>
        <n-input
          v-model:value="buyText"
          type="textarea"
          :rows="3"
          placeholder="想买什么：例如「想买一双跑步鞋 399 元」"
        />
        <n-button type="primary" class="act" :loading="advising" @click="advise">帮我判断</n-button>

        <div v-if="advice" class="result card">
          <div class="row kv-row"><span>建议</span><b :class="adviceClass">{{ adviceLabel }}</b></div>
          <div class="row kv-row"><span>理由</span><b>{{ advice.reason }}</b></div>
          <div class="row kv-row"><span>风险等级</span><b>{{ advice.risk_level }}</b></div>
          <div class="disclaimer">{{ advice.disclaimer || '以上仅为消费提醒，不构成财务建议。' }}</div>
        </div>
        <div v-else class="ai-advise-empty muted">说出想买的东西，会结合你这个月的现金流与近期还款，告诉你「现在买合不合适」。</div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useMessage } from 'naive-ui'
import { supabase, callAgnes } from '../lib/supabase'
import { trackEvent } from '../lib/analytics'
import { useAuthStore } from '../stores/auth'
import { useAppStore } from '../stores/app'
import { buildProjection } from '../composables/useProjection'
import { formatMoney } from '../lib/labels'
import { SAFETY_LINE } from '../lib/constants'
import { readPref, readStartBalance, readRecurringRepayment } from '../lib/prefs'
import { useBusy } from '../composables/useBusy'
import {
  makeBlankDraft, normalizeAiResult, isLowConfidence,
  validateDraft, collectWritable
} from '../lib/aiDraft'
import {
  habitOptions, habitCategories, recordUsage, recordAlias
} from '../lib/categoryHabits'

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
// AI 拒答 / 低置信 / 上游不可用时的降级引导（不静默报「系统繁忙」）
const degradedHint = ref('')
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
  const options = habitOptions()
  drafts.value.forEach((d) => { map[d.id] = validateDraft(d, options) })
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
    // 把「你的常用分类」传给模型，新增分类无需改服务端
    const res = await callAgnes('parse_note', {
      text: noteText.value,
      categories: habitCategories()
    })
    // 服务端降级（拒答 / 解析失败 / 条目全不合法）：引导手动补录，不把降级体当草稿
    if (res?.degraded) {
      degradedHint.value = res.result?.message || '未能识别，请手动补录'
      return
    }
    degradedHint.value = ''
    // 带上原文与习惯：模型没给分类或给了别名时自动归一，用户不必逐条改
    const items = normalizeAiResult(res, noteText.value, habitOptions())
    if (!items.length) return message.warning('没解析出可用的账目，换个说法试试')
    // 追加而非替换：绝不覆盖用户已经编辑过的草稿
    drafts.value = [...drafts.value, ...items]
    message.success(`新增 ${items.length} 笔草稿，分类已自动识别，请核对`)
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
  const { writable, invalid } = collectWritable(drafts.value, onlyId, habitOptions())
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
    // 写库成功后才学；习惯记忆失败不能影响「写入成功」的结果反馈
    try {
      const byId = new Map(drafts.value.map((d) => [d.id, d]))
      for (const w of writable) {
        recordUsage(w.value.category)
        const original = byId.get(w.id)
        if (original?.originalCategory && original.originalCategory !== w.value.category) {
          recordAlias(original.originalCategory, w.value.category)
        }
      }
    } catch {
      // 忽略：记账主流程已完成，不向用户误报失败
    }
    const done = new Set(writable.map((w) => w.id))
    drafts.value = drafts.value.filter((d) => !done.has(d.id))
    // 同步推演引擎的已记流水：仪表盘 / 日历无需刷新即可反映这一笔
    try { await app.reloadTransactions() } catch { /* 刷新失败不否定写入成功 */ }
    trackEvent('ai_note_created', { count: writable.length, source: 'ai' }, `ai:${Date.now()}`)
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
    month,
    actuals: app.transactions
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
    // FR-13：月预算与待收收入，供模型判断「还有多少钱可花 / 补贴尚未到账」
    monthlyBudget: Number(readPref('monthlyBudget', 0)) || 0,
    pendingIncome: (app.pendingIncome || []).map((r) => ({
      type: String(r.type || ''),
      est_amount: r.est_amount ?? null,
      status: String(r.status || 'unreceived')
    })),
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
    if (res?.degraded) {
      advice.value = {
        advice: '未能判断',
        reason: res.result?.message || '暂时没能生成建议，请稍后再试',
        risk_level: '未知',
        disclaimer: '以上仅为消费提醒，不构成财务建议，也不承诺任何收益。'
      }
      return
    }
    advice.value = res.result
  } catch (e) {
    message.error(e.message || '分析失败，请稍后重试')
  } finally {
    advising.value = false
  }
}
</script>

<style scoped>
/* 页身份 */
.ai-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; flex-wrap: wrap; margin-bottom: 18px; }
.ai-id { display: flex; flex-direction: column; gap: 6px; }
.ai-eyebrow {
  font-size: var(--fs-micro); font-weight: 800; letter-spacing: .14em; text-transform: uppercase;
  color: var(--c-primary); background: var(--c-primary-soft); border-radius: var(--r-pill);
  padding: 3px 10px; align-self: flex-start;
}
.ai-title { font-size: 26px; font-weight: 750; line-height: 1.2; letter-spacing: -.02em; margin: 0; color: var(--c-text); }
.ai-desc { font-size: 12.5px; line-height: 1.7; max-width: 460px; }

/* 双栏工具台 */
.ai-bench { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 16px; align-items: start; }
.ai-tool {
  background: var(--c-surface);
  border: 1px solid var(--c-border);
  border-radius: var(--radius);
  padding: 18px;
  box-shadow: var(--shadow-sm);
  display: flex; flex-direction: column; gap: 12px;
}
.tool-head { display: flex; align-items: center; gap: 11px; }
.tool-ico {
  width: 34px; height: 34px; flex: none;
  display: inline-flex; align-items: center; justify-content: center;
  border-radius: var(--r-sm);
  background: var(--c-primary-soft); color: var(--c-primary);
}
.tool-head b { font-size: 15px; font-weight: 700; color: var(--c-text); display: block; }
.tool-sub { font-size: 11.5px; color: var(--c-text-3); }
.ai-tool .act { align-self: flex-start; }

/* 草稿清单 */
.draft-head {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  margin-bottom: 6px;
}
.pick {
  display: flex; align-items: center; gap: 6px;
  font-size: var(--fs-caption); cursor: pointer;
}
.pick input { accent-color: var(--c-primary); }

.src-tag {
  font-size: var(--fs-micro); padding: 2px 8px;
  border-radius: var(--r-pill);
  background: var(--c-surface-3); color: var(--c-text-2);
  white-space: nowrap;
}
.src-ai { color: var(--c-success); background: var(--c-success-soft); }
.src-low { color: var(--c-warning-text); background: var(--c-warning-soft); }

.draft-err {
  color: var(--c-danger); font-size: var(--fs-caption); margin-bottom: 6px;
}

/* 单笔草稿：五个字段压到同一行，标签小字置于控件上方 */
.edit-grid {
  display: grid;
  grid-template-columns: 1.15fr .85fr 1.3fr .9fr 1.8fr;
  gap: 8px 10px;
  align-items: end;
}
.fld { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.fld > span { font-size: var(--fs-micro); color: var(--c-text-2); }
.fld input[type="date"] {
  width: 100%; box-sizing: border-box; padding: 5px 8px;
  border: 1px solid var(--c-border); border-radius: var(--radius-sm);
  background: var(--c-surface); color: var(--c-text); font-size: 13px;
}
.fld-wide { grid-column: auto; }

.draft-foot {
  display: flex; justify-content: space-between; align-items: center;
  gap: 10px; flex-wrap: wrap; margin-top: 6px;
}
.draft-submit {
  display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-top: 8px;
}
.draft-bar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.draft-actions { margin-left: auto; }
.hint { font-size: var(--fs-caption); }
.below { margin-top: 4px; }
.draft-wrap { display: flex; flex-direction: column; gap: 10px; }

.kv-row { flex-wrap: wrap; }
.kv-row b { word-break: break-all; }
.result { padding: 16px 18px; }

.ai-advise-empty { font-size: 12.5px; line-height: 1.7; padding: 14px 0; }

.disclaimer { font-size: var(--fs-micro); color: var(--c-text-3); line-height: 1.7; margin: 10px 0 0; }

@media (max-width: 980px) {
  .ai-bench { grid-template-columns: minmax(0, 1fr); }
}
@media (max-width: 768px) {
  .ai-title { font-size: 22px; }
  .ai-tool { padding: 15px; }
  .edit-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .fld-wide { grid-column: 1 / -1; }
  .draft-actions { margin-left: 0; width: 100%; }
  .kv-row b { text-align: left; width: 100%; }
}
</style>
