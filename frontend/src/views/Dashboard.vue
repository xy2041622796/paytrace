<template>
  <div v-if="loading" class="muted">正在加载档案…</div>
  <div v-else class="dash pt-page">
    <!-- 页身份：左对齐，与操作同行，不再套用居中页头 -->
    <header class="dash-head">
      <div class="dash-head-main">
        <span class="dash-eyebrow">总览 · {{ year }} 年 {{ month }} 月</span>
        <h1 class="dash-title">现金流仪表盘</h1>
        <p class="dash-desc">按当前档案逐日推演本月现金流，把真实余额与预测口径分开呈现。
          推演月份：{{ year }} 年 {{ month }} 月 · 发薪日：每月 {{ cf.effPayDay }} 日（当天到账，遇周末照发） · 固定双休</p>
      </div>
      <div class="dash-head-actions">
        <span class="dash-cache muted">档案更新于 {{ cacheTime }}（本地缓存 12 小时）</span>
        <span v-if="refreshing" class="refresh-dot is-spinning" aria-hidden="true" />
        <n-button size="tiny" quaternary :loading="refreshing" @click="forceRefresh">强制刷新</n-button>
      </div>
    </header>

    <n-alert v-if="!app.salaryConfig" type="warning" :bordered="false" class="empty-alert stagger-in">
      还没有薪资档案，下方数字仅为占位推演。请先到「档案配置」填写税前月薪与社保基数。
    </n-alert>

    <!-- 还款到期提醒：提前 3 天 / 1 天 / 当天 / 逾期 -->
    <n-alert
      v-if="repayReminders.length"
      :type="repayReminders.some((r) => r.days < 0) ? 'error' : 'warning'"
      :bordered="false"
      class="repay-alert stagger-in"
    >
      <template #header>还款提醒（{{ repayReminders.length }} 笔）</template>
      <div v-for="r in repayReminders" :key="r.id" class="remind-row">
        <b :class="{ 'text-danger': r.days < 0 }">
          {{ r.days < 0 ? `已逾期 ${-r.days} 天` : r.days === 0 ? '今天到期' : `还有 ${r.days} 天` }}
        </b>
        <span> · {{ r.due_date }} · {{ formatMoney(r.amount) }}</span>
        <span v-if="r.status === 'overdue'" class="text-danger"> · 已标记逾期</span>
      </div>
      <div class="muted">到期前 3 天、1 天与当天在此提醒；还完请到「档案配置 → 还款日历」标记已还。</div>
    </n-alert>

    <!-- 首屏横幅：「现在还剩多少」。真实余额由用户维护，与推演值严格分开摆放 -->
    <section class="dash-hero">
      <div class="hero-main">
        <Mascot :level="balanceLevel" :size="92" />
        <div class="hero-text">
          <div class="hero-kicker">
            现在还剩
            <StatusChip tone="primary">真实余额 · 你说了算</StatusChip>
          </div>
          <div v-if="!editingBalance" class="hero-amount">
            <span v-if="currentBalance.value == null" class="hero-empty">还没填过</span>
            <template v-else>{{ formatMoney(currentBalance.value, false) }}<span class="hero-unit">元</span></template>
          </div>
          <div v-else class="hero-edit">
            <n-input-number v-model:value="balanceDraft" size="small" style="width:150px" />
            <n-input
              v-model:value="balanceReason" size="small" style="width:250px"
              placeholder="这次为什么变？（如：发工资 / 交房租 / 买菜）"
            />
            <n-button size="small" type="primary" @click="saveBalance">保存</n-button>
            <n-button size="small" quaternary @click="editingBalance = false">取消</n-button>
          </div>
          <div class="hero-line">{{ heroLine }}</div>
          <div v-if="currentBalance.updatedAt" class="hero-updated muted">上次更新 {{ currentBalance.updatedAt }}</div>
        </div>
      </div>
      <div class="hero-side">
        <n-button v-if="!editingBalance" size="small" type="primary" @click="startEditBalance">更新余额</n-button>
        <n-button size="small" tertiary :disabled="currentBalance.value == null" @click="syncToStart">设为推演期初</n-button>
        <p class="hero-hint muted">下面的「月末预计 / 月内最低」是<b>推演值</b>，不是你手里的钱。<br />想让预测贴近现实，点一下「设为推演期初」。</p>
      </div>
    </section>

    <!-- 余额变动台账：每一次金额变化都留痕，可逐条核对 -->
    <SectionCard class="log-card" title="余额变动记录" icon="listCheck">
      <div class="log-head" @click="showLog = !showLog">
        <span class="muted">共 {{ balanceLog.length }} 条 · 每次变动都留痕</span>
        <StatusChip class="log-check" :class="logCheck.count === 0 ? 'is-pending' : (logCheck.chainOk && logCheck.consistent ? 'is-ok' : 'is-bad')" tone="success">
          {{ logCheck.count === 0 ? '待建立基线' : (logCheck.chainOk && logCheck.consistent ? '核对一致' : '核对异常') }}
        </StatusChip>
        <span class="log-toggle">{{ showLog ? '收起' : '展开' }}</span>
      </div>
      <div v-if="showLog" class="log-body">
        <EmptyState v-if="!logRows.length" text="还没有记录。第一次更新余额时会建立基线。" icon="inbox" />
        <div v-for="r in logRows" :key="r.id" class="log-row">
          <span class="log-at">{{ r.at }}</span>
          <span class="log-kind" :class="'k-' + r.kind">{{ kindLabel[r.kind] || '变动' }}</span>
          <span class="log-change">
            <template v-if="r.from == null">
              起始金额 <b>{{ formatMoney(r.to) }}</b>
            </template>
            <template v-else>
              {{ formatMoney(r.from) }} → <b>{{ formatMoney(r.to) }}</b>
              <em :class="r.delta < 0 ? 'text-danger' : 'text-success'">
                {{ r.delta >= 0 ? '+' : '' }}{{ formatMoney(r.delta) }}
              </em>
            </template>
          </span>
          <span class="log-reason">{{ r.reason }}</span>
        </div>
        <div class="log-foot muted">
          当前显示 {{ currentBalance.value == null ? '—' : formatMoney(currentBalance.value) }} ·
          台账最新 {{ logCheck.latest == null ? '—' : formatMoney(logCheck.latest) }} ·
          {{ logCheck.count === 0 ? '尚无基线记录' : (logCheck.consistent ? '两者一致' : '不一致，请检查') }}；金额按「分」计算，差额逐条可核对。
        </div>
      </div>
    </SectionCard>

    <!-- 核心指标：一眼可见的最重要的四个数 -->
    <div class="dash-stats">
      <StatCard label="月到手（当前）" tone="primary">
        <span class="text-primary">{{ formatMoney(netNow.net) }}</span>
      </StatCard>
      <StatCard label="月末预计余额" tone="info">
        {{ formatMoney(cf.monthEnd) }}
      </StatCard>
      <StatCard label="月内最低余额" tone="danger">
        <span :class="cf.monthMin < 0 ? 'text-danger' : ''">{{ formatMoney(cf.monthMin) }}</span>
      </StatCard>
      <StatCard label="现金转负日" tone="danger">
        <span :class="cf.negativeFrom ? 'text-danger' : 'text-success'">{{ cf.negativeFrom ? `${month}月${cf.negativeFrom}日` : '无' }}</span>
      </StatCard>
    </div>

    <!-- 主图表 + 侧栏：非对称两栏，图表占主，侧栏放口径与起点 -->
    <div class="dash-split">
      <SectionCard class="chart-card" title="现金余额走势（逐日 · 多薪资情景）" icon="chart">
        <CashflowTimeline
          :dates="cf.dates"
          :day-types="cf.dayTypes"
          :events="cf.events"
          :series="cf.series"
          :main-label="cf.mainLabel"
        />
        <div class="pt-legend">
          <span class="pt-legend-item"><i class="pt-legend-dot pt-legend-dot--success" /> 发薪到账</span>
          <span class="pt-legend-item"><i class="pt-legend-dot pt-legend-dot--danger" /> 还款扣款</span>
          <span class="pt-legend-item"><i class="pt-legend-dot pt-legend-dot--warning" /> 固定开支</span>
          <span class="pt-legend-item"><i class="pt-legend-dot pt-legend-dot--info" /> 零线</span>
        </div>
        <div class="type-tip muted">节点日历属性（悬停查看）：工作日 / 周末 / 法定节假日 / 调休补班</div>
      </SectionCard>

      <div class="pt-stack">
        <!-- 推演起点：模型从月初 1 号起算用的假设值，与首屏「现在还剩」是两个概念 -->
        <SectionCard class="core-config" title="推演起点" icon="target" muted>
          <div class="field-label">推演起点 · 期初余额（月初 1 号的假设值，不是你现在手里的钱）</div>
          <div class="core-row">
            <n-input-number v-model:value="startBalance" :min="0" size="small" style="width:160px" />
            <span class="muted core-hint">下面的预测都从这个数开始算；想用真实余额，点首屏「设为推演期初」。</span>
          </div>
        </SectionCard>

        <!-- 只读口径卡：把「数字怎么来的」摊开给用户看，不提供任何编辑入口 -->
        <SectionCard class="caliber-card" title="推演口径（只读）" icon="book">
          <div class="caliber-grid">
            <div class="caliber-item">
              <div class="field-label">公司用工附加成本</div>
              <div class="ro">{{ formatMoney(companyCost) }}</div>
              <div class="muted caliber-note">公司缴纳的社保 / 公积金合计，不从工资里扣，仅作用工成本参考。</div>
            </div>
            <div class="caliber-item">
              <div class="field-label">社保比例来源</div>
              <div class="ro">{{ insuranceSourceLabel }}</div>
              <div class="muted caliber-note">{{ insuranceSourceNote }}</div>
            </div>
            <div class="caliber-item">
              <div class="field-label">月固定开支口径</div>
              <div class="ro">{{ expenseSpreadLabel }}</div>
              <div class="muted caliber-note">{{ expenseSpreadNote }}</div>
            </div>
          </div>
        </SectionCard>
      </div>
    </div>

    <!-- 次要内容统一折叠收纳 -->
    <n-collapse :default-expanded-names="['risk']" class="dash-collapse">
      <n-collapse-item title="风险提示" name="risk">
        <template #header-extra>
          <span class="muted">共 {{ cf.warnings.length }} 条</span>
        </template>
        <div
          v-for="w in cf.warnings"
          :key="w.kind + w.date"
          class="dash-risk"
          :class="'lv-' + w.level"
        >
          <div class="risk-head">
            <StatusChip tone="danger">{{ levelLabel[w.level] }}</StatusChip>
            <b>{{ w.title }}</b>
            <span class="risk-date">{{ w.date }}</span>
          </div>
          <div class="risk-detail">{{ w.detail }}</div>
          <div class="risk-advice">建议：{{ w.advice }}</div>
        </div>
      </n-collapse-item>

      <n-collapse-item title="情景试算（调薪假设）" name="scenario">
        <div class="config-row">
          <div class="cfg-item">
            <div class="field-label">当前税前月薪（来自档案）</div>
            <div class="ro">{{ currentPreTax ? formatMoney(currentPreTax) : '—' }}</div>
          </div>
          <div class="cfg-item">
            <div class="field-label">假设税前月薪（调薪试算）</div>
            <div class="tier-row">
              <n-button
                v-for="t in quickTiers"
                :key="t"
                size="small"
                :type="assumePreTax === t ? 'primary' : 'default'"
                @click="assumePreTax = t"
              >{{ formatMoney(t, false) }}</n-button>
              <n-input-number v-model:value="assumePreTax" :min="0" size="small" style="width:130px" />
              <span class="muted">元 · 也可自定义</span>
            </div>
          </div>
        </div>
        <p class="muted fc-tip">点选快捷档位或自定义金额，即可预览「如果涨薪到 X」后的余额与风险，当前档位高亮；仅为试算值，不写库、不改变档案。</p>
      </n-collapse-item>

      <n-collapse-item title="补贴到账试算" name="bonus">
        <div class="bonus-tools">
          <n-switch v-model:value="bonusEnabled" />
          <span>{{ bonusEnabled ? '已开启' : '默认关闭' }}</span>
          <n-input-number
            v-model:value="scenarioBonus" :min="0" size="small" style="width:160px"
            :disabled="!bonusEnabled" placeholder="补贴金额"
          />
          <span class="muted">元 · 拟到账的一次性收入（如补贴 / 奖金）</span>
        </div>
        <div v-if="bonusEnabled" class="bonus-result">
          <div class="bonus-head">
            <span class="trial-badge">试算值 · 不写库</span>
            <b>假设这笔未来一次性收入到账</b>
          </div>
          <div class="bonus-row"><span>拟到账补贴</span><b>+ {{ formatMoney(scenarioBonus) }}</b></div>
          <div class="bonus-row"><span>月末预计余额（预测曲线）</span><b>{{ formatMoney(cf.monthEnd) }}</b></div>
          <div class="bonus-row">
            <span>试算后月末余额 = 月末预计余额 + 补贴</span>
            <b :class="bonusTrialEnd < 0 ? 'text-danger' : 'text-success'">{{ formatMoney(bonusTrialEnd) }}</b>
          </div>
          <p class="muted fc-tip">以上为「假设一次性收入到账」的试算值，不写库、不改变预测曲线，也不代表真实余额；真正到账请到「流水账本 · 待收收入」正式录入。</p>
        </div>
        <p v-else class="muted fc-tip">默认关闭。开启后可试算一笔未来一次性收入对余额的影响；金额仅保存在本机偏好，不写库、不改变预测曲线。</p>
      </n-collapse-item>

      <n-collapse-item title="应急备用金目标" name="cushion">
        <div class="cushion-tools">
          <span class="muted">目标金额（元）</span>
          <n-input-number v-model:value="targetCushion" :min="0" size="small" style="width:140px" />
          <span class="muted">达成度 {{ cushionPercent }}%</span>
        </div>
        <div class="cushion-track"><div class="cushion-fill" :style="{ width: cushionPercent + '%' }" /></div>
        <div class="cushion-row">
          <span>本月末预计 {{ formatMoney(cf.monthEnd) }}</span>
          <b :class="cushionGap > 0 ? 'text-warning' : 'text-success'">
            {{ cushionGap > 0 ? `还差 ${formatMoney(cushionGap)}` : '已达成' }}
          </b>
        </div>
        <p class="muted fc-tip">{{ cushionHint }}</p>
      </n-collapse-item>

      <n-collapse-item :title="`未来 ${forecastMonths} 个月前瞻`" name="forecast">
        <template #header-extra>
          <span class="muted">以上月结余滚动推演</span>
        </template>
        <div class="forecast-tools">
          <n-radio-group v-model:value="forecastMonths" size="small">
            <n-radio-button :value="3">3 个月</n-radio-button>
            <n-radio-button :value="6">6 个月</n-radio-button>
          </n-radio-group>
          <div class="recurring">
            <span class="muted">每月固定还款（如分期月供）</span>
            <n-input-number v-model:value="recurringRepayment" :min="0" size="small" style="width:130px" />
          </div>
        </div>
        <div class="forecast-list">
          <div v-for="m in forecast" :key="m.label" class="dash-fc" :class="'lv-' + m.riskLevel">
            <div class="fc-head"><b>{{ m.label }}</b><span class="fc-tag">{{ m.topRisk || '无风险' }}</span></div>
            <div class="fc-row"><span>月末结余</span><b :class="m.endBalance < 0 ? 'text-danger' : ''">{{ formatMoney(m.endBalance) }}</b></div>
            <div class="fc-row"><span>月内最低</span><b>{{ formatMoney(m.minBalance) }}</b></div>
            <div class="fc-row"><span>当月到手</span><b>{{ formatMoney(m.netSalary) }}</b></div>
            <div v-if="m.negativeFrom" class="fc-note">本月 {{ m.negativeFrom }} 日起转负</div>
          </div>
        </div>
        <p class="muted fc-tip">{{ taxHint }} 当月按已录入账单推演；未来月份按「固定开支 + 每月固定还款」补充，已录入同额月供的月份不会重复扣款。</p>
      </n-collapse-item>
    </n-collapse>

    <p class="muted tip">
      说明：档案数据自动缓存，变更后即时生效；工资按每月 {{ cf.effPayDay }} 日当天到账，
      还款按账单日当天扣款，两者都不因周末或节假日顺延。期初余额保存在本机，仪表盘与月度对账共用同一个值。
    </p>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useMessage } from 'naive-ui'
import { useAuthStore } from '../stores/auth'
import { useAppStore } from '../stores/app'
import { buildProjection } from '../composables/useProjection'
import CashflowTimeline from '../components/CashflowTimeline.vue'
import Mascot from '../components/Mascot.vue'
import {
  RISK_LEVEL_LABEL as levelLabel, formatMoney, formatDateTimeCN
} from '../lib/labels'
import {
  readPref, writePref, migrateLegacy, readStartBalance, writeStartBalance,
  readExpenseSpreadMode, readCurrentBalance, writeCurrentBalance,
  readBalanceLog, verifyBalanceLog
} from '../lib/prefs'
import { round2 } from '../lib/validation'
import { todayISO } from '../lib/date'
import { SAFETY_LINE } from '../lib/constants'

const message = useMessage()
const auth = useAuthStore()
const app = useAppStore()
const loading = ref(true)
const refreshing = ref(false)
const startBalance = ref(readStartBalance())
const assumePreTax = ref(6000)
const quickTiers = [4000, 5000, 5500, 6000]
const forecastMonths = ref(6)
const targetCushion = ref(readPref('cushionTarget', 2000))
const recurringRepayment = ref(
  migrateLegacy('paytrace:forecast-recurring', 'recurringRepayment', 0)
)
// 补贴到账试算：开关默认关，金额存本机偏好；只用于展示，绝不进入 buildProjection
const bonusEnabled = ref(readPref('scenarioBonusEnabled', false))
const scenarioBonus = ref(Number(readPref('scenarioBonus', 0)) || 0)

// 「现在还剩多少」：真实余额，与期初/推演余额分开存放。
// 用户口述金额时，由 Agent 通过「更新余额」输入框写入；跨标签同步靠偏好事件。
const currentBalance = ref(readCurrentBalance())
const editingBalance = ref(false)
const balanceDraft = ref(0)
const balanceReason = ref('')
const showLog = ref(true)
const balanceLog = ref(readBalanceLog())
const logCheck = ref(verifyBalanceLog())
const kindLabel = { baseline: '建立基线', update: '余额变动', sync: '同步' }
const logRows = computed(() => balanceLog.value.slice().reverse())
function refreshBalanceLog() {
  balanceLog.value = readBalanceLog()
  logCheck.value = verifyBalanceLog()
}
const balanceLevel = computed(() => {
  const v = currentBalance.value.value
  if (v == null) return 'mid'
  if (v < 0) return 'neg'
  if (v < SAFETY_LINE) return 'low'
  if (v < 2000) return 'mid'
  return 'ok'
})
const heroLine = computed(() => {
  const v = currentBalance.value.value
  if (v == null) return '点「更新余额」告诉我你现在手里有多少钱；以后直接跟我说个数就行。'
  if (v < 0) return '已经透支了，先看看哪笔支出能往后挪一挪。'
  if (v < SAFETY_LINE) return '有点紧，大额消费先缓一缓，撑到发薪日。'
  if (v < 2000) return '够用，不过离舒服的安全垫还差一点。'
  return '手里挺宽裕，按现在的节奏能稳稳撑住。'
})
function startEditBalance() {
  balanceDraft.value = currentBalance.value.value ?? 0
  balanceReason.value = ''
  editingBalance.value = true
}
function saveBalance() {
  const next = Number(balanceDraft.value)
  if (!Number.isFinite(next)) return message.error('请输入有效金额')
  const prev = currentBalance.value.value
  // 金额没变就不制造一条假变动：既保持台账干净，也避免误记
  if (prev != null && Math.round(prev * 100) === Math.round(next * 100)) {
    editingBalance.value = false
    return message.info('金额和之前一样，没有产生变动，未记新账')
  }
  writeCurrentBalance(next, { reason: balanceReason.value })
  currentBalance.value = readCurrentBalance()
  refreshBalanceLog()
  editingBalance.value = false
  balanceReason.value = ''
  message.success('已记下余额，并写入变动记录')
}
// 只把余额同步为推演起点，余额本身没变，台账不记（台账只记录真实金额变动）
function syncToStart() {
  const v = currentBalance.value.value
  if (v == null) return
  writeStartBalance(v)
  startBalance.value = v
  message.success('已把当前余额设为推演期初')
}

// 本机偏好变更后，让推演立即重算（同页自定义事件 + 跨标签页 storage）
const prefRevision = ref(0)
const onPrefChange = () => {
  prefRevision.value++
  // 账本页或另一个标签页改了期初余额，这里同步，保证两处推演基准一致
  const shared = readStartBalance()
  if (Math.abs(shared - Number(startBalance.value)) > 0.001) startBalance.value = shared
  // 另一个标签页更新了「现在还剩多少」，首屏与台账都要跟着变
  currentBalance.value = readCurrentBalance()
  refreshBalanceLog()
}

const now = new Date()
const year = now.getFullYear()
const month = now.getMonth() + 1
const pad = (n) => String(n).padStart(2, '0')

const currentPreTax = computed(() => app.salaryConfig?.pre_tax_salary || 0)
const cacheTime = computed(() => formatDateTimeCN(app.lastLoadedAt))

// 统一推演入口：仪表盘与账本对账共用，保证同一个月只有一个预测值
const projection = computed(() => {
  void prefRevision.value
  return buildProjection({
    app,
    startBalance: Number(startBalance.value) || 0,
    assumePreTax: assumePreTax.value,
    year,
    month,
    recurringRepayment: recurringRepayment.value,
    months: forecastMonths.value
  })
})
const cf = computed(() => projection.value.cf)

// 站内还款提醒：未标记已还、且距到期 ≤3 天（含当天与逾期）的账单
// 用今天(GMT+8)与账单日的自然日差，避免时间戳时区把日期算错一天
const repayReminders = computed(() => {
  const base = new Date(`${todayISO()}T00:00:00`).getTime()
  return (app.repayments || [])
    .filter((r) => r.status !== 'paid' && r.due_date)
    .map((r) => ({
      ...r,
      days: Math.round((new Date(`${r.due_date}T00:00:00`).getTime() - base) / 86400000)
    }))
    .filter((r) => Number.isFinite(r.days) && r.days <= 3)
    .sort((a, b) => a.days - b.days)
})
const forecast = computed(() => projection.value.forecast)
const netNow = computed(() => projection.value.netNow)
const ytdCount = computed(() => projection.value.ytdCount)
const taxHint = computed(() => ytdCount.value
  ? `个税已按你录入的 ${ytdCount.value} 个月真实薪资精确累计。`
  : '个税按「年内每月薪资相同」估算；若年内调过薪，可到「档案配置」录入历史薪资校准。')

// 只读口径：全部取自统一推演入口，避免各页面另算一套
const companyCost = computed(() => Number(projection.value.companyCost) || 0)
const rulesMatched = computed(() => Number(projection.value.rules?.matched) || 0)
const insuranceSourceLabel = computed(() => rulesMatched.value > 0 ? '规则表' : '内置兜底')
const insuranceSourceNote = computed(() => rulesMatched.value > 0
  ? `已命中 ${rulesMatched.value} 条社保 / 公积金规则，比例来自 insurance_rule 规则表。`
  : '规则表无匹配数据，比例回落为武汉 2026 内置兜底值。')
const expenseSpreadLabel = computed(() => {
  void prefRevision.value
  return readExpenseSpreadMode() === 'daily' ? '月固定开支按日均摊' : '月固定开支按扣款日计入'
})
const expenseSpreadNote = computed(() => expenseSpreadLabel.value === '月固定开支按日均摊'
  ? '月固定开支按当月天数均摊到每一天，更贴近日常零花的真实节奏。'
  : '月固定开支全部计入扣费日当天，不做日均摊。')

// 补贴试算：仅在展示层把「月末预计余额」加上补贴，不写库、不进预测曲线
const bonusTrialEnd = computed(() => round2(cf.value.monthEnd + (Number(scenarioBonus.value) || 0)))

// 目标安全垫
const cushionTarget = computed(() => Math.max(0, Number(targetCushion.value) || 0))
const cushionPercent = computed(() => {
  if (cushionTarget.value <= 0) return 100
  return Math.min(100, Math.max(0, Math.round((cf.value.monthEnd / cushionTarget.value) * 100)))
})
const cushionGap = computed(() => round2(Math.max(0, cushionTarget.value - cf.value.monthEnd)))
const cushionHint = computed(() => {
  if (cushionTarget.value <= 0) return '设置一个目标金额，就能看到每月的达成进度。'
  if (cushionGap.value <= 0) return '本月末即可达成目标，可以把结余转进应急备用金。'
  const hit = forecast.value.find((m) => m.endBalance >= cushionTarget.value)
  return hit
    ? `按当前推演，预计 ${hit.label} 月末达成目标。`
    : `未来 ${forecastMonths.value} 个月内尚未达成；可以试着调高「假设税前月薪」看调薪后的变化。`
})

// 偏好写入防抖：数字输入每敲一位都写 localStorage + 广播事件，
// 会触发全量多月推演与图表重绘；合并 250ms 内的连续输入只落一次盘。
function debounced(fn, ms) {
  let timer = null
  const wrapped = (...args) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => { timer = null; fn(...args) }, ms)
  }
  wrapped.cancel = () => { if (timer) clearTimeout(timer); timer = null }
  return wrapped
}
const writers = [
  debounced((v) => writeStartBalance(v), 250),
  debounced((v) => writePref('recurringRepayment', Number(v) || 0), 250),
  debounced((v) => writePref('cushionTarget', Number(v) || 0), 250),
  debounced((v) => writePref('scenarioBonus', Number(v) || 0), 250),
  debounced((v) => writePref('scenarioBonusEnabled', !!v), 250)
]
watch(startBalance, (v) => writers[0](v))
watch(recurringRepayment, (v) => writers[1](v))
watch(targetCushion, (v) => writers[2](v))
watch(scenarioBonus, (v) => writers[3](v))
watch(bonusEnabled, (v) => writers[4](v))

async function forceRefresh() {
  refreshing.value = true
  try {
    await app.refresh()
    message.success('档案已重新加载')
  } catch (e) {
    message.error(e.message || '刷新失败')
  } finally {
    refreshing.value = false
  }
}

async function loadData() {
  loading.value = true
  try {
    await auth.ensureReady()
    if (!auth.userId) return
    await app.load()
    // 空档案时页面内已有常驻提示，不再额外弹一次浮动消息
  } catch (e) {
    message.error(e.message || '加载失败')
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  window.addEventListener('paytrace:pref-changed', onPrefChange)
  window.addEventListener('storage', onPrefChange)
  loadData()
})
onBeforeUnmount(() => {
  // 卸载后不再落盘，避免防抖定时器写入已失效的偏好
  writers.forEach((w) => w.cancel())
  window.removeEventListener('paytrace:pref-changed', onPrefChange)
  window.removeEventListener('storage', onPrefChange)
})
</script>

<style scoped>
/* 页身份：左对齐，与操作同行 —— 与旧版居中页头刻意不同 */
.dash-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 20px; flex-wrap: wrap; margin-bottom: 18px; }
.dash-head-main { min-width: 0; }
.dash-eyebrow {
  display: inline-block;
  font-size: var(--fs-micro); font-weight: 800; letter-spacing: .14em;
  text-transform: uppercase; color: var(--c-primary);
  background: var(--c-primary-soft); border-radius: var(--r-pill);
  padding: 3px 10px; margin-bottom: 8px;
}
.dash-title { font-size: 28px; font-weight: 750; line-height: 1.2; letter-spacing: -.02em; margin: 0; color: var(--c-text); }
.dash-desc { font-size: 13px; color: var(--c-text-2); margin: 7px 0 0; max-width: 860px; line-height: 1.7; }
.dash-head-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; white-space: nowrap; }
.dash-cache { font-size: 12px; }
.refresh-dot {
  width: 9px; height: 9px; flex-shrink: 0;
  border-radius: 50%;
  border: 2px solid var(--c-primary-soft-2);
  border-top-color: var(--c-primary);
}
.empty-alert { margin: 0 0 14px; }
.repay-alert { margin: 0 0 14px; }
.remind-row { font-size: 13px; line-height: 1.9; }

/* 首屏横幅：全宽 accent 带，左对齐；与旧版居中 hero 卡形成差异 */
.dash-hero {
  display: flex; align-items: center; gap: 22px; flex-wrap: wrap;
  background: linear-gradient(120deg, var(--c-primary-soft) 0%, var(--c-surface) 58%);
  border: 1px solid var(--c-primary-soft-2);
  border-radius: var(--radius-lg);
  padding: 22px 26px; margin: 0 0 16px;
  overflow: hidden;
}
[data-theme='dark'] .dash-hero { background: linear-gradient(120deg, var(--c-primary-soft) 0%, var(--c-surface) 70%); }
.hero-main { display: flex; align-items: center; gap: 18px; flex: 1; min-width: 280px; }
.hero-text { min-width: 200px; }
.hero-kicker { font-size: 13px; color: var(--c-text-2); display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.hero-amount { font-size: 42px; font-weight: 750; line-height: 1.2; font-variant-numeric: tabular-nums; letter-spacing: -.5px; margin-top: 2px; }
.hero-unit { font-size: 15px; font-weight: 500; color: var(--c-text-3); margin-left: 6px; }
.hero-empty { font-size: 26px; font-weight: 600; color: var(--c-text-3); }
.hero-edit { display: flex; align-items: center; gap: 8px; margin: 6px 0; flex-wrap: wrap; }
.hero-line { font-size: 13px; color: var(--c-text-2); margin-top: 4px; }
.hero-updated { font-size: 11px; margin-top: 4px; }
.hero-side { display: flex; flex-direction: column; gap: 8px; align-items: flex-start; flex-shrink: 0; }
.hero-hint { font-size: 12px; color: var(--c-text-3); line-height: 1.7; margin: 2px 0 0; max-width: 240px; }

/* 余额变动台账 */
.log-card { padding: 14px 18px; }
.log-head { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; cursor: pointer; font-size: 13px; }
.log-head .muted { font-size: 12px; }
.log-check { font-size: 11px; }
.log-check.is-ok { color: var(--c-success); background: var(--c-success-soft); }
.log-check.is-bad { color: var(--c-danger); background: var(--c-danger-soft); }
.log-check.is-pending { color: var(--c-warning-text); background: var(--c-warning-soft); }
.log-toggle { margin-left: auto; font-size: 12px; color: var(--c-primary); }
.log-body { margin-top: 12px; border-top: 1px solid var(--c-border); padding-top: 10px; }
.log-row {
  display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap;
  font-size: 12px; padding: 7px 0; border-bottom: 1px dashed var(--c-border);
  font-variant-numeric: tabular-nums;
}
.log-at { color: var(--c-text-3); white-space: nowrap; }
.log-kind { font-size: 11px; padding: 1px 7px; border-radius: 4px; color: var(--c-text-2); background: var(--c-hover); white-space: nowrap; }
.log-kind.k-baseline { color: var(--c-primary); background: var(--c-primary-soft); }
.log-change { color: var(--c-text-2); }
.log-change b { color: var(--c-text); }
.log-change em { font-style: normal; margin-left: 6px; font-weight: 600; }
.log-reason { color: var(--c-text-2); flex: 1; min-width: 160px; }
.log-foot { font-size: 11px; line-height: 1.7; margin-top: 10px; }

/* 核心指标条：横贯整行，不再 auto-fit 叠成方块 */
.dash-stats {
  display: grid; grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px; margin: 0 0 16px;
}
.dash-stats .pt-stat { margin-bottom: 0; }

/* 主图表 + 侧栏：非对称两栏（图表 1.9fr / 侧栏 1fr） */
.dash-split { display: grid; grid-template-columns: minmax(0, 1.9fr) minmax(0, 1fr); gap: 16px; align-items: start; }
.chart-card, .core-config, .caliber-card { margin-bottom: 0; }
.core-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.core-hint { font-size: 12px; line-height: 1.6; }
.ro { font-size: 16px; font-weight: 600; padding: 2px 0; }
.caliber-grid { display: grid; grid-template-columns: 1fr; gap: 12px; }
.caliber-item { min-width: 0; }
.caliber-item .ro { color: var(--c-text); }
.caliber-note { font-size: 12px; line-height: 1.6; margin-top: 4px; }
.type-tip { margin-top: 8px; font-size: 12px; }

/* 情景试算 / 补贴 / 备用金 / 前瞻 */
.config-row { display: flex; gap: 24px; margin: 6px 0; flex-wrap: wrap; align-items: flex-end; }
.cfg-item { display: flex; flex-direction: column; gap: 6px; }
.tier-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.tier-row .muted { font-size: 12px; }
.fc-tip { margin-top: 8px; font-size: 12px; line-height: 1.6; }
.bonus-tools { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.bonus-tools .muted { font-size: 12px; }
.bonus-result {
  margin-top: 12px; padding: 12px 14px;
  border: 1px dashed var(--c-warning); border-radius: var(--radius-sm);
  background: var(--c-warning-soft);
}
.bonus-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 8px; }
.trial-badge { font-size: 11px; padding: 2px 8px; border-radius: 4px; color: var(--c-warning-text); background: var(--c-warning-soft); }
.bonus-row { display: flex; justify-content: space-between; gap: 10px; flex-wrap: wrap; font-size: 13px; padding: 4px 0; color: var(--c-text-2); }
.bonus-row b { color: var(--c-text); word-break: break-all; }
.cushion-tools { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; }
.cushion-tools .muted { font-size: 12px; }
.cushion-track { height: 10px; border-radius: var(--r-pill); background: var(--c-hover); overflow: hidden; }
.cushion-fill { height: 100%; border-radius: var(--r-pill); background: var(--c-success); transition: width var(--dur-base) var(--ease-out); }
.cushion-row { display: flex; justify-content: space-between; gap: 10px; flex-wrap: wrap; margin-top: 10px; font-size: 13px; }
.dash-collapse { margin-top: 4px; }
.forecast-tools { display: flex; gap: 16px; align-items: center; flex-wrap: wrap; margin-bottom: 14px; }
.recurring { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.recurring .muted { font-size: 12px; }
.forecast-list { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }

/* 风险卡与前瞻卡：左侧色条按等级区分 */
.dash-risk, .dash-fc {
  border: 1px solid var(--c-border);
  border-left: 3px solid var(--c-border-strong);
  border-radius: var(--radius-sm);
  padding: 12px 14px;
  margin-bottom: 10px;
  background: var(--c-surface-2);
}
.dash-fc { padding: 12px; }
.dash-risk.lv-red, .dash-fc.lv-red { border-left-color: var(--c-danger); background: var(--c-danger-soft); }
.dash-risk.lv-orange, .dash-fc.lv-orange { border-left-color: var(--c-warning); }
.dash-risk.lv-yellow, .dash-fc.lv-yellow { border-left-color: var(--c-warning-text); }
.dash-risk.lv-info, .dash-fc.lv-info { border-left-color: var(--c-success); }
.risk-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.risk-head b { font-size: 14px; }
.risk-date { margin-left: auto; font-size: 12px; color: var(--c-text-3); }
.risk-detail { font-size: 13px; color: var(--c-text-2); margin-top: 6px; line-height: 1.6; }
.risk-advice { font-size: 13px; color: var(--c-text); margin-top: 4px; line-height: 1.6; }
.fc-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 8px; }
.fc-head b { font-size: 14px; }
.fc-tag { font-size: 11px; color: var(--c-text-3); text-align: right; }
.fc-row { display: flex; justify-content: space-between; gap: 8px; font-size: 12px; padding: 3px 0; color: var(--c-text-2); }
.fc-row b { color: var(--c-text); font-weight: 600; }
.fc-note { margin-top: 6px; font-size: 11px; color: var(--c-danger); }
.tip { font-size: 12px; margin-top: 14px; line-height: 1.7; }

@media (max-width: 1100px) {
  .dash-split { grid-template-columns: minmax(0, 1fr); }
}
@media (max-width: 900px) {
  .forecast-list { grid-template-columns: repeat(2, 1fr); }
  .dash-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 768px) {
  .dash-head { margin-bottom: 14px; }
  .dash-title { font-size: 22px; }
  .dash-hero { padding: 16px; gap: 14px; }
  .hero { padding: 14px; }
  .hero-amount { font-size: 34px; }
  .hero-side { flex-direction: row; flex-wrap: wrap; }
  .hero-hint { display: none; }
  .log-card { padding: 12px; }
  .log-toggle { margin-left: 0; }
  .config-row { gap: 14px; }
  .risk-date { margin-left: 0; }
  .forecast-list { grid-template-columns: 1fr; }
  .caliber-grid { gap: 10px; }
  .bonus-row, .cushion-row, .fc-row { flex-wrap: wrap; }
}
</style>
