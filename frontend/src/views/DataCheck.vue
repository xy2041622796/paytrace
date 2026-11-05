<template>
  <div class="check">
    <h2 class="page-title">数据体检</h2>

    <!-- 常驻错误条：加载 / 检查失败时明确显示，不只是一闪而过的提示 -->
    <div v-if="loadError" class="load-error card" role="alert">
      <div class="load-error-text">
        <b>数据加载失败</b>
        <span>{{ loadError }}</span>
        <span>可检查网络与登录态后重试；页面下方的扫描结果可能不完整。</span>
      </div>
      <n-button size="small" type="primary" :loading="checking" @click="runCheck">重试</n-button>
    </div>

    <p class="muted intro">
      主动扫描档案、开支、还款与流水的合法性，把脏数据挡在推演之前。
      检查只读，不会修改任何数据。
    </p>

    <div class="bar">
      <n-button type="primary" :loading="checking" @click="runCheck">重新检查</n-button>
      <n-button :loading="exporting" :disabled="exporting" @click="exportBackup">导出全量备份</n-button>
      <n-button :disabled="!!presetPlan" @click="preparePreset">按基准数据预填</n-button>
      <span class="muted">上次检查：{{ formatDateTimeCN(checkedAt) }}</span>
    </div>

    <div v-if="presetPlan" class="preset card">
      <div class="issue-head"><span class="tag">待确认</span><b>本机参数预填预览</b></div>
      <p class="muted intro">数据来自 product_baseline.json（基准日 2026-10-31）。只写本机偏好，不修改数据库；预填值为推定参考，请对照工资条核对。</p>
      <div v-for="(line, i) in presetPlan.applied" :key="'a' + i" class="detail">· 将写入：{{ line }}</div>
      <div v-for="(line, i) in presetPlan.skipped" :key="'s' + i" class="advice">· 跳过：{{ line }}</div>
      <div v-if="!presetPlan.applied.length" class="detail">没有需要写入的项，现有参数已全部保留。</div>
      <div class="preset-actions">
        <n-button size="small" type="primary" :disabled="!presetPlan.applied.length" @click="applyPreset">确认写入</n-button>
        <n-button size="small" @click="presetPlan = null">取消</n-button>
      </div>
    </div>
    <p class="muted intro">备份是只读的 JSON 快照，刻意不提供导入功能，避免误覆盖现有数据。</p>

    <div class="summary">
      <div class="s card"><div class="sl">严重问题</div><div class="sv text-danger">{{ errorCount }}</div></div>
      <div class="s card"><div class="sl">需要留意</div><div class="sv text-warning">{{ warnCount }}</div></div>
      <div class="s card"><div class="sl">提示</div><div class="sv text-success">{{ infoCount }}</div></div>
    </div>

    <div v-if="!issues.length" class="muted">点击「重新检查」开始扫描。</div>
    <div v-for="(item, idx) in issues" :key="idx" class="issue card" :class="'lv-' + item.level">
      <div class="issue-head"><span class="tag">{{ levelLabel[item.level] }}</span><b>{{ item.title }}</b></div>
      <div class="detail">{{ item.detail }}</div>
      <div v-if="item.advice" class="advice">处理建议：{{ item.advice }}</div>
    </div>

    <!-- AI 交互日志：只读回看 + 标记采纳状态 -->
    <div class="ai-log card">
      <div class="ai-log-head">
        <b>AI 交互日志</b>
        <n-button size="small" :loading="logLoading" @click="loadAiLogs">刷新</n-button>
        <span class="muted">最近 50 条，按时间倒序</span>
      </div>
      <p class="muted intro">来自 ai_interaction_log。可标记「已采纳 / 未采纳」，用于回看 AI 记账与购物劝导是否被采用；标记只写采纳状态，不改原始解析结果。</p>
      <div v-if="logError" class="log-error">{{ logError }}</div>
      <div v-else-if="!aiLogs.length" class="muted">暂无 AI 交互记录。</div>
      <div v-else class="log-table-wrap">
        <table class="log-table">
          <thead>
            <tr><th>时间</th><th>动作</th><th>置信度</th><th>采纳状态</th><th>操作</th></tr>
          </thead>
          <tbody>
            <tr v-for="row in aiLogs" :key="row.id">
              <td>{{ formatDateTimeCN(row.created_at) }}</td>
              <td>{{ actionLabel(row.action) }}</td>
              <td>{{ confidenceLabel(row.confidence) }}</td>
              <td>{{ acceptedLabel(row.accepted) }}</td>
              <td>
                <div class="log-btns">
                  <n-button size="tiny" :disabled="row.accepted === true" @click="markAccepted(row, true)">已采纳</n-button>
                  <n-button size="tiny" :disabled="row.accepted === false" @click="markAccepted(row, false)">未采纳</n-button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useMessage } from 'naive-ui'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/auth'
import { useAppStore } from '../stores/app'
import { isValidISODate, todayISO, monthRangeISO } from '../lib/date'
import { formatDateTimeCN, formatMoney } from '../lib/labels'
import { USER_DEFAULTS } from '../lib/constants'
import { readPref, writePref, readStartBalance, writeStartBalance } from '../lib/prefs'
import { planBaselinePreset, baselineAlignment } from '../lib/baseline'

const message = useMessage()
const auth = useAuthStore()
const app = useAppStore()
const issues = ref([])
const checking = ref(false)
const exporting = ref(false)
const checkedAt = ref(0)
const presetPlan = ref(null)
const loadError = ref('')
const aiLogs = ref([])
const logLoading = ref(false)
const logError = ref('')
const levelLabel = { red: '严重', yellow: '留意', info: '提示' }
const errorCount = computed(() => issues.value.filter((i) => i.level === 'red').length)
const warnCount = computed(() => issues.value.filter((i) => i.level === 'yellow').length)
const infoCount = computed(() => issues.value.filter((i) => i.level === 'info').length)

const actionLabel = (a) => ({ parse_note: '大白话记账', advise_purchase: '购物劝导' }[a] || a || '—')
const confidenceLabel = (c) => (c == null || c === '' ? '—' : Number(c).toFixed(2))
const acceptedLabel = (v) => (v === true ? '已采纳' : v === false ? '未采纳' : '未标记')

// 预填只生成本机偏好，分「预览 → 确认」两步，绝不静默覆盖用户已填的值
function preparePreset() {
  presetPlan.value = planBaselinePreset({
    startBalance: readStartBalance(),
    recurringRepayment: readPref('recurringRepayment', 0),
    salaryYtd: readPref('salaryYtd', [])
  })
}

function applyPreset() {
  const { values, applied } = presetPlan.value || {}
  if (!values || !applied?.length) return
  if (values.startBalance != null) writeStartBalance(values.startBalance)
  if (values.recurringRepayment != null) writePref('recurringRepayment', values.recurringRepayment)
  if (values.salaryYtd != null) writePref('salaryYtd', values.salaryYtd)
  presetPlan.value = null
  message.success(`已写入 ${applied.length} 项本机参数`)
  runCheck()
}

// AI 交互日志：只读列表 + 写 accepted 标记采纳状态
async function loadAiLogs() {
  logLoading.value = true
  logError.value = ''
  try {
    await auth.ensureReady()
    const uid = auth.userId
    if (!uid) throw new Error('未登录，无法读取 AI 交互日志')
    const { data, error } = await supabase
      .from('ai_interaction_log')
      .select('*')
      .eq('user_id', uid)
      .order('created_at', { ascending: false })
      .limit(50)
    if (error) throw error
    aiLogs.value = data || []
  } catch (e) {
    logError.value = e.message || '读取 AI 交互日志失败'
  } finally {
    logLoading.value = false
  }
}

async function markAccepted(row, value) {
  try {
    const { error } = await supabase
      .from('ai_interaction_log')
      .update({ accepted: value })
      .eq('id', row.id)
    if (error) throw error
    row.accepted = value
    message.success(value ? '已标记为已采纳' : '已标记为未采纳')
  } catch (e) {
    message.error(e.message || '标记失败')
  }
}

async function runCheck() {
  checking.value = true
  loadError.value = ''
  const found = []
  let pends = []
  const add = (level, title, detail, advice = '') => found.push({ level, title, detail, advice })
  const num = (v) => Number(v)

  try {
    await auth.ensureReady()
    const uid = auth.userId
    if (!uid) {
      add('red', '未登录', '无法读取数据，请先登录。')
    } else {
      await app.load()

      // ① 个人档案
      const p = app.profile
      if (!p) {
        add('red', '缺少个人档案', 'profiles 中没有你的记录，推演会使用内置默认值。', '到「档案配置」保存一次基础信息')
      } else {
        if (p.hire_date && !isValidISODate(p.hire_date)) {
          add('red', '入职日期非法', `当前值：${p.hire_date}`, '到「档案配置」重新选择日期')
        }
        if (!Number.isInteger(num(p.pay_day)) || num(p.pay_day) < 1 || num(p.pay_day) > 31) {
          add('red', '发薪日非法', `当前值：${p.pay_day}，应为 1-31`, '到「档案配置」修正')
        }
        if (!Number.isFinite(num(p.tax_threshold)) || num(p.tax_threshold) < 0) {
          add('red', '个税起征点非法', `当前值：${p.tax_threshold}`, '到「档案配置」修正')
        }
        add('info', '档案口径', `发薪日每月 ${p.pay_day ?? USER_DEFAULTS.payDay} 日当天到账；个税起征点 ${formatMoney(p.tax_threshold ?? USER_DEFAULTS.taxThreshold)}；固定双休。`)
      }

      // ② 薪资档案
      const sc = app.salaryConfig
      if (!sc) {
        add('red', '缺少薪资档案', '没有税前工资与社保基数，所有推演金额都会是 0。', '到「档案配置」建立第一版')
      } else {
        const keys = ['pre_tax_salary', 'sb_base_pension', 'sb_base_medical', 'sb_base_unemploy', 'sb_base_fund']
        const bad = keys.filter((k) => !Number.isFinite(num(sc[k])) || num(sc[k]) < 0)
        if (bad.length) add('red', '薪资字段非法', `异常字段：${bad.join('、')}`, '保存一份新的薪资档案版本')
        if (!(num(sc.pre_tax_salary) > 0)) add('red', '税前工资为 0', '到手工资会被兜底为 0。', '填写真实税前月薪')
        if (num(sc.sb_base_medical) !== num(sc.sb_base_unemploy)) {
          add('info', '医疗与失业基数不同', '两个险种使用了不同基数，这是允许的，引擎会分别计算。')
        }
      }

      const ytd = readPref('salaryYtd', [])
      const ytdValid = (Array.isArray(ytd) ? ytd : []).filter((r) => Number(r.preTax) > 0)
      if (ytdValid.length) {
        add('info', '个税已按真实历史薪资校准',
          `已录入 ${ytdValid.length} 个月的税前工资与五险一金，仪表盘按真实累计预扣计算。`,
          '工资条数据有变动时，到「档案配置 → 年内历史薪资」更新')
      } else if (app.salaryHistory.length > 1) {
        add('yellow', '年内存在调薪记录',
          `共 ${app.salaryHistory.length} 个薪资版本，但尚未录入年内各月真实薪资，个税按「每月相同」估算可能与实际工资条有差异。`,
          '到「档案配置 → 年内历史薪资」填入各月工资条数据')
      }

      // ③ 月固定开支
      const names = {}
      app.expenses.forEach((e) => {
        names[e.name] = (names[e.name] || 0) + 1
        if (!(num(e.monthly_amount) >= 0)) add('red', '开支金额非法', `「${e.name}」金额：${e.monthly_amount}`, '删除后重新添加')
        if (!Number.isInteger(num(e.deduct_day)) || num(e.deduct_day) < 1 || num(e.deduct_day) > 31) {
          add('red', '扣款日非法', `「${e.name}」扣款日：${e.deduct_day}`, '删除后重新添加')
        }
      })
      Object.entries(names).filter(([, c]) => c > 1).forEach(([n, c]) => {
        add('yellow', '重复开支名称', `「${n}」出现 ${c} 次，会按同日合并计入，可能重复扣款。`, '合并或删除多余记录')
      })

      // ④ 还款事件
      const today = todayISO()
      app.repayments.forEach((r) => {
        if (!isValidISODate(r.due_date)) add('red', '还款日期非法', `当前值：${r.due_date}`, '删除后重新添加')
        if (!(num(r.amount) > 0)) add('red', '还款金额非法', `当前值：${r.amount}`, '删除后重新添加')
        if (r.status === 'pending' && r.due_date < today) {
          add('yellow', '还款已过期仍标为待还', `${r.due_date} 的 ${formatMoney(r.amount)} 尚未标记完成。`, '确认是否已还清，避免重复计入预测')
        }
      })

      // ⑤ 流水
      const now = new Date()
      const range = monthRangeISO(now.getFullYear(), now.getMonth() + 1)
      const [txnRes, pendRes] = await Promise.all([
        supabase.from('transaction').select('*').eq('user_id', uid).limit(1000),
        supabase.from('pending_income').select('*').eq('user_id', uid).limit(500)
      ])
      if (txnRes.error || pendRes.error) {
        add('red', '读取流水失败', txnRes.error?.message || pendRes.error?.message)
      } else {
        const txns = txnRes.data || []
        txns.forEach((t) => {
          if (!isValidISODate(t.txn_date)) add('red', '流水日期非法', `分类「${t.category}」日期：${t.txn_date}`, '在「流水账本」删除该条')
          if (t.direction !== 'income' && t.direction !== 'expense') {
            add('red', '流水方向非法', `分类「${t.category}」方向：${t.direction}`, '在「流水账本」删除该条')
          }
          if (!(num(t.amount) > 0)) add('red', '流水金额非法', `分类「${t.category}」金额：${t.amount}`, '在「流水账本」删除该条')
          if (t.txn_date > today) add('yellow', '存在未来日期流水', `分类「${t.category}」日期：${t.txn_date}`, '确认是否填错年份')
        })
        const thisMonth = txns.filter((t) => String(t.txn_date).startsWith(range.start.slice(0, 7)))
        add('info', '本月流水', `${thisMonth.length} 条，列表查询上限 1000 条；月度汇总按当月全量独立查询，不受列表条数影响。`)

        pends = pendRes.data || []
        pends.forEach((x) => {
          if (!Number.isFinite(num(x.est_amount)) || num(x.est_amount) < 0) {
            add('red', '待收金额非法', `「${x.type}」金额：${x.est_amount}`, '在「流水账本」修正')
          }
        })
        const open = pends.filter((x) => x.status === 'unreceived' || x.status === 'reviewing')
        if (open.length) {
          add('info', '待收收入未计入余额', `${open.length} 项待收，合计 ${formatMoney(open.reduce((a, x) => a + (num(x.est_amount) || 0), 0))}。到账后记得点「标记到账」。`, '到账后写入流水，避免把没到的钱当余额')
        }

        // ⑥ 基准数据核对：确认 0002_real_data_seed.sql 的落库结果
        const todayDate = new Date()
        const align = baselineAlignment({
          salaryConfig: app.salaryConfig,
          expenses: app.expenses,
          repayments: app.repayments,
          liabilities: app.liabilities,
          pending: pends,
          nowYear: todayDate.getFullYear(),
          nowMonth: todayDate.getMonth() + 1
        })
        if (align.aligned) {
          add('info', '基准数据核对通过', `库内 ${align.checked.length} 项与 product_baseline.json 一致，真实数据已正确落库。`)
        } else {
          align.diffs.forEach((d) => {
            add('yellow', `与基准数据不同：${d.label}`,
              `当前 ${d.actual}${d.unit}，基准为 ${d.expect}${d.unit}。`,
              '若刚执行完种子 SQL 就出现，请确认脚本完整执行；若是有意调整，忽略即可')
          })
        }
        if (todayDate.getFullYear() === 2026 && todayDate.getMonth() + 1 === 11) {
          add('info', '当月一次性支出', '11.1 话费充值 100 元属当月一次性支出，未写入还款日历；请在「流水账本」补记，否则对账会显示偏差。')
        }
      }
    }

    if (!found.some((i) => i.level === 'red' || i.level === 'yellow')) {
      add('info', '全部检查通过', '未发现缺失、非法或重复的业务数据。', '建议每次调整档案或大额记账后重跑一次')
    }
  } catch (e) {
    add('red', '检查过程出错', e.message || String(e), '稍后重试；若持续失败请检查网络与登录态')
    loadError.value = e.message || String(e) || '档案加载失败'
    message.error(e.message || '检查失败')
  } finally {
    issues.value = found
    checkedAt.value = Date.now()
    checking.value = false
  }
}

// 全量备份：只读导出，不提供导入，避免误覆盖现有数据
async function exportBackup() {
  exporting.value = true
  try {
    await auth.ensureReady()
    const uid = auth.userId
    if (!uid) throw new Error('未登录')
    await app.load()
    const [txnRes, todoRes, pendRes, aiRes] = await Promise.all([
      supabase.from('transaction').select('*').eq('user_id', uid).order('txn_date'),
      supabase.from('todo').select('*').eq('user_id', uid).order('created_at'),
      supabase.from('pending_income').select('*').eq('user_id', uid).order('created_at'),
      supabase.from('ai_interaction_log').select('*').eq('user_id', uid).order('created_at')
    ])
    const queryError = txnRes.error || todoRes.error || pendRes.error || aiRes.error
    if (queryError) throw queryError

    const backup = {
      产品: '现金流安全垫',
      导出时间: formatDateTimeCN(Date.now()),
      说明: '只读快照；不含登录凭据与服务端密钥',
      基础档案: app.profile,
      薪资版本: app.salaryHistory,
      月固定开支: app.expenses,
      还款事件: app.repayments,
      负债: app.liabilities,
      流水: txnRes.data || [],
      待办: todoRes.data || [],
      待收收入: pendRes.data || [],
      AI交互日志: aiRes.data || [],
      本机偏好: {
        期初余额: readStartBalance(),
        年内历史薪资: readPref('salaryYtd', []),
        应急备用金目标: readPref('cushionTarget', null),
        每月固定还款: readPref('recurringRepayment', null),
        对账容差: readPref('reconcileTolerance', 1)
      }
    }
    const blob = new Blob([JSON.stringify(backup, null, 2)], {
      type: 'application/json;charset=utf-8'
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `现金流安全垫_备份_${todayISO()}.json`
    a.click()
    URL.revokeObjectURL(url)
    message.success(`备份已导出（${(txnRes.data || []).length} 条流水）`)
  } catch (e) {
    message.error(e.message || '导出失败')
  } finally {
    exporting.value = false
  }
}

onMounted(() => {
  runCheck()
  loadAiLogs()
})
</script>

<style scoped>
.page-title { font-size: 20px; font-weight: 600; margin: 0 0 4px; }
.intro { line-height: 1.7; margin-bottom: 14px; }
.bar { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
.bar .muted { font-size: 12px; }
.load-error { display: flex; align-items: center; justify-content: space-between; gap: 12px; border-left: 3px solid var(--c-danger); padding: 12px 14px; margin: 12px 0; }
.load-error-text { display: flex; flex-direction: column; gap: 4px; font-size: 13px; min-width: 0; }
.load-error-text span { color: var(--c-text-2); line-height: 1.6; word-break: break-word; }
.summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin: 16px 0; }
.sl { font-size: 12px; color: var(--c-text-2); margin-bottom: 6px; }
.sv { font-size: 22px; font-weight: 600; }
.text-warning { color: var(--c-warning); }
.issue { border-left: 3px solid var(--c-border); margin-bottom: 10px; padding: 12px 14px; }
.issue.lv-red { border-left-color: var(--c-danger); }
.issue.lv-yellow { border-left-color: var(--c-warning); }
.issue.lv-info { border-left-color: var(--c-success); }
.issue-head { display: flex; align-items: center; gap: 10px; }
.tag { font-size: 11px; padding: 2px 8px; border-radius: 4px; background: var(--c-hover); color: var(--c-text-2); }
.lv-red .tag { color: var(--c-danger); background: rgba(239, 68, 68, .12); }
.lv-yellow .tag { color: var(--c-warning); background: rgba(245, 158, 11, .14); }
.lv-info .tag { color: var(--c-success); background: rgba(16, 185, 129, .12); }
.detail { font-size: 13px; color: var(--c-text-2); margin-top: 6px; line-height: 1.6; }
.advice { font-size: 13px; margin-top: 4px; line-height: 1.6; }
.preset { border-left: 3px solid var(--c-primary, #FF6B35); margin: 14px 0; padding: 12px 14px; }
.preset .intro { margin: 8px 0 4px; }
.preset-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
.ai-log { padding: 14px; margin-top: 18px; }
.ai-log-head { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.ai-log-head .muted { font-size: 12px; }
.ai-log .intro { margin: 8px 0 0; }
.log-error { color: var(--c-danger); font-size: 13px; margin-top: 10px; }
.log-table-wrap { overflow-x: auto; margin-top: 10px; }
.log-table { width: 100%; min-width: 520px; border-collapse: collapse; font-size: 13px; }
.log-table th, .log-table td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--c-border); vertical-align: middle; white-space: nowrap; }
.log-table th { color: var(--c-text-2); font-weight: 600; }
.log-table td { color: var(--c-text-2); }
.log-btns { display: flex; gap: 6px; flex-wrap: wrap; }

@media (max-width: 768px) {
  .summary { gap: 8px; }
  .sv { font-size: 19px; }
}
</style>
