<template>
  <div v-if="loading" class="muted">正在加载档案…</div>
  <div v-else class="dash">
    <h2 class="page-title">现金流仪表盘</h2>
    <p class="muted">
      推演月份：{{ year }} 年 {{ month }} 月 ·
      发薪日：每月 {{ cf.effPayDay }} 日（当天到账，遇周末照发） ·
      固定双休
    </p>
    <div class="cache-bar">
      <span class="muted">档案更新于 {{ cacheTime }}（本地缓存 12 小时）</span>
      <span v-if="refreshing" class="refresh-dot is-spinning" aria-hidden="true" />
      <n-button size="tiny" quaternary :loading="refreshing" @click="forceRefresh">强制刷新</n-button>
    </div>

    <n-alert v-if="!app.salaryConfig" type="warning" :bordered="false" class="empty-alert">
      还没有薪资档案，下方数字仅为占位推演。请先到「档案配置」填写税前月薪与社保基数。
    </n-alert>

    <!-- 还款到期提醒：提前 3 天 / 1 天 / 当天 / 逾期 -->
    <n-alert
      v-if="repayReminders.length"
      :type="repayReminders.some((r) => r.days < 0) ? 'error' : 'warning'"
      :bordered="false"
      class="repay-alert"
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

    <!-- 核心：期初余额（推演基准，常驻） -->
    <div class="card core-config">
      <div class="field-label">期初余额（元）· 仪表盘与月度对账共用同一个值</div>
      <n-input-number v-model:value="startBalance" :min="0" size="small" style="width:160px" />
    </div>

    <!-- 核心指标：一眼可见的最重要的四个数 -->
    <div class="stats">
      <div class="stat card">
        <div class="stat-label">月到手（当前）</div>
        <div class="stat-value text-primary">{{ formatMoney(netNow.net) }}</div>
      </div>
      <div class="stat card">
        <div class="stat-label">月末预计余额</div>
        <div class="stat-value">{{ formatMoney(cf.monthEnd) }}</div>
      </div>
      <div class="stat card">
        <div class="stat-label">月内最低余额</div>
        <div class="stat-value" :class="cf.monthMin < 0 ? 'text-danger' : ''">{{ formatMoney(cf.monthMin) }}</div>
      </div>
      <div class="stat card">
        <div class="stat-label">现金转负日</div>
        <div class="stat-value" :class="cf.negativeFrom ? 'text-danger' : 'text-success'">
          {{ cf.negativeFrom ? `${month}月${cf.negativeFrom}日` : '无' }}
        </div>
      </div>
    </div>

    <!-- 核心：现金走势 -->
    <div class="card chart-card">
      <div class="card-title">现金余额走势（逐日 · 多薪资情景）</div>
      <CashflowTimeline
        :dates="cf.dates"
        :day-types="cf.dayTypes"
        :events="cf.events"
        :series="cf.series"
        :main-label="cf.mainLabel"
      />
      <div class="legend">
        <span><i class="lg lg-pay" /> 发薪到账</span>
        <span><i class="lg lg-rep" /> 还款扣款</span>
        <span><i class="lg lg-exp" /> 固定开支</span>
        <span><i class="lg lg-zero" /> 零线</span>
      </div>
      <div class="type-tip muted">节点日历属性（悬停查看）：工作日 / 周末 / 法定节假日 / 调休补班</div>
    </div>

    <!-- 只读口径卡：把「数字怎么来的」摊开给用户看，不提供任何编辑入口 -->
    <div class="card caliber-card">
      <div class="card-title">推演口径（只读）</div>
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
          class="risk-item"
          :class="'lv-' + w.level"
        >
          <div class="risk-head">
            <span class="risk-tag">{{ levelLabel[w.level] }}</span>
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
          <div v-for="m in forecast" :key="m.label" class="forecast-item" :class="'lv-' + m.riskLevel">
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
import {
  RISK_LEVEL_LABEL as levelLabel, formatMoney, formatDateTimeCN
} from '../lib/labels'
import {
  readPref, writePref, migrateLegacy, readStartBalance, writeStartBalance,
  readExpenseSpreadMode
} from '../lib/prefs'
import { round2 } from '../lib/validation'
import { todayISO } from '../lib/date'

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

// 本机偏好变更后，让推演立即重算（同页自定义事件 + 跨标签页 storage）
const prefRevision = ref(0)
const onPrefChange = () => {
  prefRevision.value++
  // 账本页或另一个标签页改了期初余额，这里同步，保证两处推演基准一致
  const shared = readStartBalance()
  if (Math.abs(shared - Number(startBalance.value)) > 0.001) startBalance.value = shared
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

watch(startBalance, (v) => writeStartBalance(v))
watch(recurringRepayment, (v) => writePref('recurringRepayment', Number(v) || 0))
watch(targetCushion, (v) => writePref('cushionTarget', Number(v) || 0))
watch(scenarioBonus, (v) => writePref('scenarioBonus', Number(v) || 0))
watch(bonusEnabled, (v) => writePref('scenarioBonusEnabled', !!v))

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
  window.removeEventListener('paytrace:pref-changed', onPrefChange)
  window.removeEventListener('storage', onPrefChange)
})
</script>

<style scoped>
.page-title { font-size: 20px; font-weight: 600; margin: 0 0 4px; }
.cache-bar { display: flex; align-items: center; gap: 10px; margin-top: 6px; }
.cache-bar .muted { font-size: 12px; }
.empty-alert { margin: 14px 0; }
.repay-alert {
  margin: 14px 0;
  animation: dash-alert-in var(--dur-base) var(--ease-out) backwards;
}
.remind-row { font-size: 13px; line-height: 1.9; }
.refresh-dot {
  width: 9px; height: 9px; flex-shrink: 0;
  border-radius: 50%;
  border: 2px solid var(--c-primary-soft);
  border-top-color: var(--c-primary);
}
@keyframes dash-alert-in {
  from { opacity: 0; transform: translateY(-6px); }
  to   { opacity: 1; transform: translateY(0); }
}
.core-config { margin: 14px 0; }
.config-row { display: flex; gap: 24px; margin: 6px 0; flex-wrap: wrap; align-items: flex-end; }
.cfg-item { display: flex; flex-direction: column; gap: 6px; }
.ro { font-size: 16px; font-weight: 600; padding: 2px 0; }
.stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin: 14px 0; }
.stat-label { font-size: 12px; color: var(--c-text-2); margin-bottom: 8px; }
.stat-value { font-size: 19px; font-weight: 600; word-break: break-all; }
.chart-card { margin-bottom: 14px; }
.card-title { font-size: 14px; font-weight: 600; margin-bottom: 12px; }
.fc-tip { margin-top: 8px; font-size: 12px; line-height: 1.6; }

.caliber-card { margin-bottom: 14px; }
.caliber-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
.caliber-item { min-width: 0; }
.caliber-item .ro { color: var(--c-text); }
.caliber-note { font-size: 12px; line-height: 1.6; margin-top: 4px; }
.tier-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.tier-row .muted { font-size: 12px; }
.bonus-tools { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.bonus-tools .muted { font-size: 12px; }
.bonus-result {
  margin-top: 12px; padding: 12px 14px;
  border: 1px dashed var(--c-warning); border-radius: var(--radius-sm);
  background: rgba(245, 158, 11, .06);
}
.bonus-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 8px; }
.trial-badge {
  font-size: 11px; padding: 2px 8px; border-radius: 4px;
  color: var(--c-warning); background: rgba(245, 158, 11, .16);
}
.bonus-row {
  display: flex; justify-content: space-between; gap: 10px; flex-wrap: wrap;
  font-size: 13px; padding: 4px 0; color: var(--c-text-2);
}
.bonus-row b { color: var(--c-text); word-break: break-all; }

.legend { display: flex; gap: 16px; margin-top: 10px; font-size: 12px; color: var(--c-text-2); flex-wrap: wrap; }
.legend .lg { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 5px; vertical-align: middle; }
.lg-pay { background: var(--c-success); }
.lg-rep { background: var(--c-danger); }
.lg-exp { background: var(--c-warning); }
.lg-zero { background: var(--c-text-3); }
.type-tip { margin-top: 8px; font-size: 12px; }
.dash-collapse { margin-top: 4px; }

.risk-item {
  border: 1px solid var(--c-border);
  border-left: 3px solid var(--c-border);
  border-radius: var(--radius-sm);
  padding: 12px 14px;
  margin-bottom: 10px;
}
.risk-item.lv-red { border-left-color: var(--c-danger); }
.risk-item.lv-orange { border-left-color: var(--c-warning); }
.risk-item.lv-yellow { border-left-color: var(--c-warning-text); }
.risk-item.lv-info { border-left-color: var(--c-success); }
.risk-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.risk-head b { font-size: 14px; }
.risk-tag { padding: 2px 8px; border-radius: 4px; font-size: 11px; }
.lv-red .risk-tag { color: var(--c-danger); background: rgba(239, 68, 68, .12); }
.lv-orange .risk-tag { color: var(--c-warning); background: rgba(245, 158, 11, .14); }
.lv-yellow .risk-tag { color: var(--c-warning-text); background: rgba(234, 179, 8, .16); }
.lv-info .risk-tag { color: var(--c-success); background: rgba(16, 185, 129, .12); }
.risk-date { margin-left: auto; font-size: 12px; color: var(--c-text-3); }
.risk-detail { font-size: 13px; color: var(--c-text-2); margin-top: 6px; line-height: 1.6; }
.risk-advice { font-size: 13px; color: var(--c-text); margin-top: 4px; line-height: 1.6; }
.text-warning { color: var(--c-warning); }

.cushion-tools { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; }
.cushion-tools .muted { font-size: 12px; }
.cushion-track { height: 10px; border-radius: 5px; background: var(--c-hover); overflow: hidden; }
.cushion-fill { height: 100%; border-radius: 5px; background: var(--c-success); transition: width .25s ease; }
.cushion-row { display: flex; justify-content: space-between; gap: 10px; flex-wrap: wrap; margin-top: 10px; font-size: 13px; }

.forecast-tools { display: flex; gap: 16px; align-items: center; flex-wrap: wrap; margin-bottom: 14px; }
.recurring { display: flex; align-items: center; gap: 8px; }
.recurring .muted { font-size: 12px; }
.forecast-list { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
.forecast-item {
  border: 1px solid var(--c-border);
  border-left: 3px solid var(--c-border);
  border-radius: var(--radius-sm);
  padding: 12px;
}
.forecast-item.lv-red { border-left-color: var(--c-danger); }
.forecast-item.lv-orange { border-left-color: var(--c-warning); }
.forecast-item.lv-yellow { border-left-color: var(--c-warning-text); }
.forecast-item.lv-info { border-left-color: var(--c-success); }
.fc-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 8px; }
.fc-head b { font-size: 14px; }
.fc-tag { font-size: 11px; color: var(--c-text-3); text-align: right; }
.fc-row { display: flex; justify-content: space-between; gap: 8px; font-size: 12px; padding: 3px 0; color: var(--c-text-2); }
.fc-row b { color: var(--c-text); font-weight: 600; }
.fc-note { margin-top: 6px; font-size: 11px; color: var(--c-danger); }
.tip { font-size: 12px; margin-top: 14px; }

@media (max-width: 900px) {
  .stats { grid-template-columns: repeat(2, 1fr); }
  .forecast-list { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 768px) {
  .config-row { gap: 14px; }
  .stat-value { font-size: 17px; }
  .risk-date { margin-left: 0; }
  .forecast-list { grid-template-columns: 1fr; }
  .caliber-grid { grid-template-columns: 1fr; gap: 12px; }
  .tip { line-height: 1.7; }
}
</style>
