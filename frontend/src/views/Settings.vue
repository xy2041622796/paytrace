<template>
  <div class="settings pt-page">
    <!-- 页身份：顶部横条，不再套用居中页头 -->
    <header class="set-head">
      <span class="set-eyebrow">管理</span>
      <h1 class="set-title">档案配置</h1>
      <p class="set-desc">工资、社保基数这类档案长期不变，设定一次持续生效。仅在调薪或基数调整时变更，每次变更会新增一个版本、保留历史，不会覆盖旧记录。所有数据仅本人可见。</p>
    </header>

    <div v-if="loadError" class="pt-note" style="color:var(--c-danger,#e55);margin-bottom:12px">
      档案加载失败：{{ loadError }}。当前显示的是默认占位值，请勿直接保存；请刷新页面重试。
    </div>

    <div class="set-layout">
      <!-- 左：常驻分区导航（点击平滑滚动到对应分区，不触发路由） -->
      <aside class="set-rail">
        <div class="set-rail-inner">
          <span class="set-rail-label">分区</span>
          <nav class="set-nav">
            <a class="set-nav-link" href="#sec-archive" @click.prevent="(e) => { const t = e.currentTarget.closest('.set-layout').querySelector('#sec-archive'); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); }">档案与版本</a>
            <a class="set-nav-link" href="#sec-edit" @click.prevent="(e) => { const t = e.currentTarget.closest('.set-layout').querySelector('#sec-edit'); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); }">变更档案</a>
            <a class="set-nav-link" href="#sec-ytd" @click.prevent="(e) => { const t = e.currentTarget.closest('.set-layout').querySelector('#sec-ytd'); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); }">年内薪资校准</a>
            <a class="set-nav-link" href="#sec-expenses" @click.prevent="(e) => { const t = e.currentTarget.closest('.set-layout').querySelector('#sec-expenses'); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); }">每月开支</a>
            <a class="set-nav-link" href="#sec-repay" @click.prevent="(e) => { const t = e.currentTarget.closest('.set-layout').querySelector('#sec-repay'); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); }">还款日历</a>
            <a class="set-nav-link" href="#sec-liability" @click.prevent="(e) => { const t = e.currentTarget.closest('.set-layout').querySelector('#sec-liability'); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); }">负债清单</a>
          </nav>
        </div>
      </aside>

      <!-- 右：分区内容 -->
      <div class="set-main">
        <section id="sec-archive" class="set-section">
          <div class="set-section-head">
            <h2 class="set-section-title">档案与版本</h2>
            <p class="set-section-desc">长期不变的基础档案，设定一次持续生效</p>
          </div>
          <div class="pt-grid-side">
            <!-- 只读档案总览 -->
            <SectionCard title="当前生效档案" icon="user" desc="长期不变的基础档案，设定一次持续生效" accent>
              <div class="archive-grid">
                <div class="arch-item"><span>所在城市</span><b>{{ archive.city }}</b></div>
                <div class="arch-item"><span>入职日期</span><b>{{ formatDateCN(archive.hireDate) }}</b></div>
                <div class="arch-item"><span>发薪日</span><b>每月 {{ archive.payDay }} 日（当天到账）</b></div>
                <div class="arch-item"><span>工作制</span><b>{{ workScheduleLabel }}</b></div>
                <div class="arch-item"><span>薪资阶段</span><b>{{ phaseLabel }}</b></div>
                <div class="arch-item"><span>税前月薪</span><b>{{ formatMoney(app.salaryConfig?.pre_tax_salary) }}</b></div>
                <div class="arch-item"><span>预计到手</span><b class="text-primary">{{ formatMoney(netNow.net) }}</b></div>
                <div class="arch-item"><span>个税起征点</span><b>{{ formatMoney(taxThreshold) }}</b></div>
              </div>
              <div class="archive-foot">
                <span class="muted archive-hint">{{ archiveHint }}</span>
                <n-button size="small" @click="editing = !editing">{{ editing ? '收起编辑' : '变更档案' }}</n-button>
              </div>
            </SectionCard>

            <!-- 版本历史 -->
            <SectionCard title="档案变更记录" icon="clock" desc="每次变更新增一个版本，保留历史不覆盖">
              <EmptyState v-if="!app.salaryHistory.length" text="暂无变更记录。" icon="inbox" />
              <div v-for="(h, i) in app.salaryHistory" :key="h.id" class="history-row">
                <span class="hist-tag" :class="{ current: i === 0 }">{{ i === 0 ? '当前生效' : '历史版本' }}</span>
                <span>{{ formatDateCN(h.created_at) }}</span>
                <span>税前 {{ formatMoney(h.pre_tax_salary) }}</span>
                <span>到手 {{ formatMoney(historyNet(h)) }}</span>
              </div>
            </SectionCard>
          </div>
        </section>

        <section id="sec-edit" class="set-section" v-if="editing">
          <div class="set-section-head">
            <h2 class="set-section-title">变更档案</h2>
            <p class="set-section-desc">调薪或基数调整时生成新版本，旧记录完整保留</p>
          </div>
          <SectionCard title="变更档案" icon="edit" desc="调薪或基数调整时生成新版本，旧记录完整保留">
            <h4 class="sub-title">基础信息</h4>
            <n-form :label-placement="isMobile ? 'top' : 'left'" :label-width="isMobile ? 'auto' : 130">
              <n-form-item label="所在城市">
                <n-input v-model:value="form.city" placeholder="如 武汉江汉区" />
              </n-form-item>
              <n-form-item label="入职日期">
                <n-date-picker v-model:value="hireTs" type="date" clearable style="width:100%" />
              </n-form-item>
              <n-form-item label="发薪日（每月）">
                <n-input-number v-model:value="form.pay_day" :min="1" :max="31" />
              </n-form-item>
              <n-form-item label="个税起征点（元）">
                <n-input-number v-model:value="form.tax_threshold" :min="0" />
              </n-form-item>
              <n-form-item label="公司作息">
                <n-select v-model:value="form.work_schedule" :options="workScheduleOptions" />
              </n-form-item>
            </n-form>
            <div class="form-actions">
              <n-button :loading="saving" :disabled="saving" @click="saveProfile">保存基础信息</n-button>
            </div>

            <n-divider />

            <h4 class="sub-title">薪资与社保基数</h4>
            <n-form :label-placement="isMobile ? 'top' : 'left'" :label-width="isMobile ? 'auto' : 130">
              <n-form-item label="税前月薪（元）">
                <n-input-number v-model:value="sal.pre_tax_salary" :min="0" style="width:100%" />
              </n-form-item>
              <n-form-item label="养老基数">
                <n-input-number v-model:value="sal.sb_base_pension" :min="0" style="width:100%" />
              </n-form-item>
              <n-form-item label="医疗基数">
                <n-input-number v-model:value="sal.sb_base_medical" :min="0" style="width:100%" />
              </n-form-item>
              <n-form-item label="失业基数">
                <n-input-number v-model:value="sal.sb_base_unemploy" :min="0" style="width:100%" />
              </n-form-item>
              <n-form-item label="公积金基数">
                <n-input-number v-model:value="sal.sb_base_fund" :min="0" style="width:100%" />
              </n-form-item>
            </n-form>

            <!-- 按武汉模板预填：严格「预览 → 确认」两步，只填未填字段，绝不覆盖用户已填值；只改表单，不写库 -->
            <n-divider />
            <h4 class="sub-title">按武汉模板预填</h4>
            <div class="pt-note settings-note">
              当前生效的个人比例：养老 {{ pctText(effectiveRates.personal.pension) }}、
              医疗 {{ pctText(effectiveRates.personal.medical) }}、
              失业 {{ pctText(effectiveRates.personal.unemployment) }}、
              公积金 {{ pctText(effectiveRates.personal.fund) }}、
              大额医疗 {{ effectiveRates.personal.bigMedicalFixed }} 元（固定）。
              来源：<b>{{ rulesSource }}</b>（{{ app.insuranceRules.length }} 条规则）。
            </div>
            <div v-if="ruleNotes.length" class="rule-notes">
              <div class="rule-note rule-note-head">
                <span>缴纳方 · 险种</span><span>比例 / 固定额</span><span>基数说明 / 计算依据</span>
              </div>
              <div v-for="(note, i) in ruleNotes" :key="i" class="rule-note">
                <span>{{ note.partyLabel }} · {{ note.item }}</span>
                <span>{{ note.rateText }}</span>
                <span class="muted">{{ note.baseLabel }} / {{ note.calcBasis }}</span>
              </div>
            </div>
            <div v-else class="pt-note settings-note">规则表暂无数据，个人 / 公司比例与口径说明使用内置兜底常量。</div>
            <div class="form-actions">
              <n-button size="small" :disabled="saving || !!presetPreview" @click="previewWuhan">预览武汉模板</n-button>
              <template v-if="presetPreview">
                <n-button size="small" type="primary" :disabled="saving || !presetPreview.applied.length" @click="confirmWuhan">
                  确认填入
                </n-button>
                <n-button size="small" @click="presetPreview = null">取消</n-button>
              </template>
            </div>
            <div v-if="presetPreview" class="preset-preview">
              <div class="pt-note settings-note">仅修改上方表单，不写入数据库；确认后仍需点「保存为新版本」才会落库。</div>
              <div v-for="(line, i) in presetPreview.applied" :key="'a' + i" class="preset-line">将填入：{{ line }}</div>
              <div v-for="(line, i) in presetPreview.skipped" :key="'s' + i" class="preset-line muted">保留：{{ line }}</div>
              <div v-if="!presetPreview.applied.length" class="preset-line">
                当前表单字段均已填写，模板不会覆盖任何值；如需按模板重置，请先手动清空对应字段。
              </div>
            </div>

            <p class="muted preview">
              到手预览：<b class="text-primary">{{ formatMoney(netPreview.net) }}</b>
              （五险一金个人 {{ formatMoney(netPreview.insuranceTotal) }}，个税 {{ formatMoney(netPreview.tax) }}）
            </p>
            <div class="form-actions">
              <n-button type="primary" :loading="saving" :disabled="saving" @click="saveSalary">保存为新版本</n-button>
              <n-button @click="editing = false">取消</n-button>
            </div>
          </SectionCard>
        </section>

        <section id="sec-ytd" class="set-section">
          <div class="set-section-head">
            <h2 class="set-section-title">年内薪资校准</h2>
            <p class="set-section-desc">年内调过薪时，按月填工资条重算个税</p>
          </div>
          <n-collapse class="block">
            <n-collapse-item title="年内历史薪资（个税校准）" name="ytd">
              <div class="pt-note settings-note">
                累计预扣法默认假设年内每月薪资相同。若年内调过薪，把各月工资条上的
                「税前工资」和「五险一金个人合计」填进来，仪表盘会按真实累计重算个税。
                这些数据只保存在本机，不上传。
              </div>
              <div class="ytd-head"><span>月份</span><span>税前月薪</span><span>五险一金合计</span><span>操作</span></div>
              <div v-for="(r, i) in ytdRows" :key="i" class="ytd-row">
                <n-select v-model:value="r.month" :options="monthOptions" size="small" />
                <n-input-number v-model:value="r.preTax" :min="0" size="small" />
                <n-input-number v-model:value="r.insuranceTotal" :min="0" size="small" />
                <n-button size="small" quaternary type="error" @click="removeYtd(i)">删除</n-button>
              </div>
              <div class="form-actions">
                <n-button size="small" @click="addYtdRow">添加一个月</n-button>
                <n-button size="small" type="primary" :disabled="saving" @click="saveYtd">保存校准</n-button>
              </div>
              <div class="pt-note settings-note">已保存 {{ savedYtdCount }} 个月；未填金额（0）的月份不参与累计。</div>
            </n-collapse-item>
          </n-collapse>
        </section>

        <section id="sec-expenses" class="set-section">
          <div class="set-section-head">
            <h2 class="set-section-title">每月开支</h2>
            <p class="set-section-desc">每月固定扣款的开支项与扣款日</p>
          </div>
          <SectionCard title="月固定开支" icon="wallet" desc="每月固定扣款的开支项与扣款日">
            <div class="table-scroll">
              <n-data-table :columns="expColumns" :data="app.expenses" :bordered="false" size="small" :scroll-x="620" />
            </div>
            <div v-if="editingExp" class="edit-row settings-row">
              <n-input v-model:value="editExp.name" placeholder="名称" style="width:150px" />
              <n-input-number v-model:value="editExp.monthly_amount" placeholder="月金额" :min="0" style="width:130px" />
              <n-input-number v-model:value="editExp.deduct_day" placeholder="扣款日" :min="1" :max="31" style="width:110px" />
              <n-button size="small" type="primary" :disabled="saving" @click="saveExp">保存</n-button>
              <n-button size="small" @click="editingExp = null">取消</n-button>
            </div>
            <div class="row-add settings-row">
              <n-input v-model:value="newExp.name" placeholder="名称（如 房租）" style="width:150px" />
              <n-input-number v-model:value="newExp.monthly_amount" placeholder="月金额" :min="0" />
              <n-input-number v-model:value="newExp.deduct_day" placeholder="扣款日" :min="1" :max="31" />
              <n-button type="primary" :disabled="saving" @click="addExp">添加</n-button>
            </div>
          </SectionCard>
        </section>

        <section id="sec-repay" class="set-section">
          <div class="set-section-head">
            <h2 class="set-section-title">还款日历</h2>
            <p class="set-section-desc">按账单日当天扣款，不顺延</p>
          </div>
          <SectionCard title="还款日历" icon="calendar" desc="按账单日当天扣款，不顺延">
            <div class="table-scroll">
              <n-data-table :columns="repayColumns" :data="app.repayments" :bordered="false" size="small" :scroll-x="880" />
            </div>
            <div class="row-add settings-row">
              <n-date-picker v-model:value="newRep.date" type="date" clearable placeholder="还款日" style="width:160px" />
              <n-input-number v-model:value="newRep.amount" placeholder="金额" :min="0" />
              <n-button type="primary" :disabled="saving" @click="addRep">添加</n-button>
            </div>
            <div class="pt-note settings-note">还款按账单日当天扣款、工资按每月发薪日当天到账，均不因周末或法定节假日顺延（用户决策，FR-16 的最终口径）；日历上的「休 / 假 / 补」仅用于阅读标注，不代表资金日期变动。若实际到账 / 扣款日与档案不一致，请直接在此调整还款日，或在「基础信息」修改发薪日。</div>
          </SectionCard>
        </section>

        <section id="sec-liability" class="set-section">
          <div class="set-section-head">
            <h2 class="set-section-title">负债清单</h2>
            <p class="set-section-desc">剩余本金总览，不会自动改写还款日历</p>
          </div>
          <n-collapse class="block">
            <n-collapse-item title="负债清单" name="liability">
              <div class="pending-sum">
                剩余本金合计 <b class="text-danger">{{ formatMoney(app.totalRemaining) }}</b>
                <span class="muted">（{{ app.liabilities.length }} 笔）</span>
              </div>
              <div class="table-scroll">
                <n-data-table :columns="liabilityColumns" :data="app.liabilities" :bordered="false" size="small" :scroll-x="880" />
              </div>
              <div v-if="editingLia" class="edit-row settings-row">
                <n-select v-model:value="editLia.type" :options="liabilityTypeOptions" style="width:110px" />
                <n-select v-model:value="editLia.status" :options="liabilityStatusOptions" style="width:100px" />
                <n-input-number v-model:value="editLia.total" placeholder="总额" :min="0" style="width:110px" />
                <n-input-number v-model:value="editLia.paid" placeholder="已还" :min="0" style="width:110px" />
                <n-input-number v-model:value="editLia.remaining_principal" placeholder="剩余本金" :min="0" style="width:120px" />
                <n-input-number v-model:value="editLia.fee" placeholder="手续费" :min="0" style="width:100px" />
                <n-date-picker v-model:value="editLia.next_repay_date" type="date" clearable placeholder="下次还款日" style="width:150px" />
                <n-button size="small" type="primary" :disabled="saving" @click="saveLia">保存</n-button>
                <n-button size="small" @click="editingLia = null">取消</n-button>
              </div>
              <div class="row-add settings-row">
                <n-select v-model:value="newLia.type" :options="liabilityTypeOptions" style="width:120px" />
                <n-select v-model:value="newLia.status" :options="liabilityStatusOptions" style="width:110px" />
                <n-input-number v-model:value="newLia.total" placeholder="总额" :min="0" />
                <n-input-number v-model:value="newLia.paid" placeholder="已还" :min="0" />
                <n-input-number v-model:value="newLia.remaining_principal" placeholder="剩余本金" :min="0" />
                <n-input-number v-model:value="newLia.fee" placeholder="手续费" :min="0" />
                <n-input-number v-model:value="newLia.monthlyPayment" placeholder="月供（仅估算）" :min="0" />
                <n-date-picker v-model:value="newLia.next_repay_date" type="date" clearable placeholder="下次还款日" style="width:160px" />
                <n-button type="primary" :disabled="saving" @click="addLia">添加</n-button>
              </div>
              <div class="row-add settings-row">
                <span class="muted">每期月供（元）</span>
                <n-input-number v-model:value="planMonthly" :min="0" style="width:140px" />
                <n-button size="small" :disabled="saving" @click="generateRepayments">按负债生成未来 3 期账单</n-button>
              </div>
              <div class="pt-note settings-note">
                新增负债的预估剩余期数：<b>{{ estRemainPeriods == null ? '—' : estRemainPeriods + ' 期' }}</b>；
                清单里的「预计剩余期数」按上方每期月供自动推导（= ceil(剩余本金 / 月供)，未计利息与手续费，仅供参考）。
                月供默认取「每月固定还款」偏好，可在此调整并保存在本机。
              </div>
              <div class="pt-note settings-note">「按负债生成未来 3 期账单」按每笔负债的下次还款日逐月生成还款事件，已存在的同日同额账单自动跳过；只新增、不改写已有数据。</div>
            </n-collapse-item>
          </n-collapse>
        </section>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, h, onMounted } from 'vue'
import { useMessage, NButton } from 'naive-ui'
import { useAuthStore } from '../stores/auth'
import { useAppStore } from '../stores/app'
import { calcNetSalary, serviceMonthIndex } from '../composables/useCashflow'
import { useIsMobile } from '../composables/useMediaQuery'
import { useBusy } from '../composables/useBusy'
import { USER_DEFAULTS, SOCIAL_BASES } from '../lib/constants'
import {
  PHASE_LABEL, LIABILITY_TYPE_LABEL, LIABILITY_STATUS_LABEL, REPAY_STATUS_LABEL,
  formatDateCN, formatMoney
} from '../lib/labels'
import { toLocalISODate, isoDateToTimestamp, todayISO, isValidISODate } from '../lib/date'
import { readPref, writePref, readSalaryYtd, writeSalaryYtd } from '../lib/prefs'
import { parseInsuranceRules } from '../lib/insurance'
import {
  validateProfile, validateSalary, validateExpense,
  validateRepayment, validateLiability, validateSalaryYtd,
  validateExpensePatch, validateLiabilityPatch
} from '../lib/validation'

const message = useMessage()
// 档案加载失败必须可见：否则页面会拿 USER_DEFAULTS 兜底值冒充实数据
const loadError = ref('')
const auth = useAuthStore()
const app = useAppStore()
const isMobile = useIsMobile()
// 所有写操作共用一个互斥锁，快速连点不会插入重复数据
const { busy: saving, run } = useBusy((m) => message.error(m))
const editing = ref(false)
const hireTs = ref(null)
// 预填预览计划（null = 未预览）；编辑中的行 id（null = 未编辑）
const presetPreview = ref(null)
const editingExp = ref(null)
const editingLia = ref(null)
const editExp = reactive({ id: null, name: '', monthly_amount: 0, deduct_day: 1 })
const editLia = reactive({
  id: null, type: 'installment', status: 'normal', total: 0, paid: 0,
  remaining_principal: 0, fee: 0, next_repay_date: null
})

const form = reactive({
  city: USER_DEFAULTS.city,
  pay_day: USER_DEFAULTS.payDay,
  tax_threshold: USER_DEFAULTS.taxThreshold,
  work_schedule: 'double'
})
const workScheduleOptions = [
  { label: '双休（周六日休息）', value: 'double' },
  { label: '单休（仅周日休息）', value: 'single' }
]
const WORK_SCHEDULE_LABEL = { double: '双休', single: '单休' }
const workScheduleLabel = computed(() =>
  WORK_SCHEDULE_LABEL[app.profile?.work_schedule] || '双休（默认）'
)
const sal = reactive({ pre_tax_salary: 0, ...SOCIAL_BASES })
const newExp = reactive({ name: '', monthly_amount: 0, deduct_day: 1 })
const newRep = reactive({ date: null, amount: 0 })
const newLia = reactive({
  type: 'installment', status: 'normal', total: 0, paid: 0,
  remaining_principal: 0, fee: 0, monthlyPayment: 0, next_repay_date: null
})

const monthOptions = Array.from({ length: 12 }, (_, i) => ({ label: `${i + 1} 月`, value: i + 1 }))
const liabilityTypeOptions = Object.entries(LIABILITY_TYPE_LABEL).map(([value, label]) => ({ label, value }))
const liabilityStatusOptions = Object.entries(LIABILITY_STATUS_LABEL).map(([value, label]) => ({ label, value }))

function defaultYtdRows() {
  const hire = new Date(`${USER_DEFAULTS.hireDate}T00:00:00`)
  const now = new Date()
  const rows = []
  if (hire.getFullYear() === now.getFullYear()) {
    for (let m = hire.getMonth() + 1; m < now.getMonth() + 1; m++) {
      rows.push({ month: m, preTax: 0, insuranceTotal: 0 })
    }
  }
  return rows
}
const ytdRows = ref(readSalaryYtd(defaultYtdRows()))
const savedYtdCount = computed(() =>
  (Array.isArray(ytdRows.value) ? ytdRows.value : []).filter((r) => Number(r.preTax) > 0).length
)

const now = new Date()
const taxThreshold = computed(() => app.profile?.tax_threshold ?? USER_DEFAULTS.taxThreshold)
const hireDate = computed(() => app.profile?.hire_date || USER_DEFAULTS.hireDate)
const monthIndex = computed(() => serviceMonthIndex(now.getFullYear(), now.getMonth() + 1, hireDate.value))

const archive = computed(() => ({
  city: app.profile?.city || USER_DEFAULTS.city,
  hireDate: hireDate.value,
  payDay: app.profile?.pay_day ?? USER_DEFAULTS.payDay
}))
const phaseLabel = computed(() => PHASE_LABEL[app.salaryConfig?.phase] || USER_DEFAULTS.salaryPhase)
// 预览与仪表盘必须用同一套比例：都读 insurance_rule 表，
// 否则运营改了规则表后，配置页显示的到手工资会和仪表盘算出两个数。
const salaryRateOptions = () => ({
  rates: effectiveRates.value.personal,
  companyRates: effectiveRates.value.company
})
const netNow = computed(() => calcNetSalary(app.salaryConfig || {}, {
  monthIndex: monthIndex.value, taxThreshold: taxThreshold.value,
  ...salaryRateOptions()
}))
const archiveHint = computed(() =>
  app.salaryConfig?.created_at
    ? `当前档案自 ${formatDateCN(app.salaryConfig.created_at)} 起生效，无需反复修改。`
    : '还没有薪资档案，点「变更档案」建立第一版。'
)
const netPreview = computed(() => calcNetSalary(sal, {
  monthIndex: monthIndex.value,
  taxThreshold: form.tax_threshold,
  ...salaryRateOptions()
}))
const historyNet = (h) => calcNetSalary(h, {
  monthIndex: monthIndex.value, taxThreshold: taxThreshold.value,
  ...salaryRateOptions()
}).net

// ============================================================
// 按武汉模板预填：只改表单，不写数据库
// 比例与口径说明读 app.insuranceRules；比例用与引擎同一个解析器，
// 表为空时它会自动回落内置兜底常量，来源文案与之保持一致。
// ============================================================
const pctText = (v) => `${Number(((Number(v) || 0) * 100).toFixed(3))}%`
const rulesSource = computed(() => (
  effectiveRates.value.matched > 0 ? '规则表（已匹配当前城市）' : '内置兜底常量'
))
const effectiveRates = computed(() => parseInsuranceRules(app.insuranceRules, app.profile?.city || null))
const ruleNotes = computed(() =>
  (Array.isArray(app.insuranceRules) ? app.insuranceRules : [])
    .filter((r) => r && r.is_active !== false)
    .map((r) => ({
      partyLabel: r.party === 'company' ? '公司' : '个人',
      item: r.item || '—',
      rateText: r.category === 'fixed'
        ? `固定 ${Number(r.amount) || 0} 元`
        : `比例 ${pctText(r.rate)}`,
      baseLabel: r.base_label || '—',
      calcBasis: r.calc_basis || '—'
    }))
)

// 基数优先从武汉规则行的 base_label 取数（如「养老基数4552」），
// 解析不到的字段回落 constants 里的 SOCIAL_BASES 内置常量。
const BASE_FIELD_BY_ITEM = {
  '养老': ['sb_base_pension'],
  '职工基本医疗保险': ['sb_base_medical', 'sb_base_unemploy'],
  '医疗': ['sb_base_medical', 'sb_base_unemploy'],
  '失业': ['sb_base_unemploy'],
  '公积金': ['sb_base_fund']
}
const templateValues = computed(() => {
  const out = { ...SOCIAL_BASES }
  for (const r of (Array.isArray(app.insuranceRules) ? app.insuranceRules : [])) {
    if (!r || r.is_active === false || !r.base_label) continue
    if (r.city && !String(r.city).includes('武汉')) continue
    const m = String(r.base_label).match(/\d+(?:\.\d+)?/)
    if (!m) continue
    const n = Number(m[0])
    if (!Number.isFinite(n) || n <= 0) continue
    for (const field of BASE_FIELD_BY_ITEM[r.item] || []) out[field] = n
  }
  return out
})
const PRESET_FIELDS = [
  { key: 'sb_base_pension', label: '养老基数' },
  { key: 'sb_base_medical', label: '医疗基数' },
  { key: 'sb_base_unemploy', label: '失业基数' },
  { key: 'sb_base_fund', label: '公积金基数' }
]

// 「已填」= 表单里是有效正数，一律保留，绝不覆盖用户已填值
function planWuhan() {
  const applied = []
  const skipped = []
  const values = {}
  for (const f of PRESET_FIELDS) {
    const cur = Number(sal[f.key])
    if (Number.isFinite(cur) && cur > 0) {
      skipped.push(`${f.label}已填 ${cur} 元，保留原值`)
    } else {
      values[f.key] = templateValues.value[f.key]
      applied.push(`${f.label} → ${templateValues.value[f.key]} 元（武汉模板）`)
    }
  }
  return { applied, skipped, values }
}

function previewWuhan() {
  presetPreview.value = planWuhan()
  message.info(`预填预览：将填入 ${presetPreview.value.applied.length} 项、保留 ${presetPreview.value.skipped.length} 项，请确认后再填入`)
}

function confirmWuhan() {
  const plan = presetPreview.value
  if (!plan) return
  for (const [key, value] of Object.entries(plan.values)) sal[key] = value
  presetPreview.value = null
  message.success(plan.applied.length
    ? `已填入 ${plan.applied.length} 项（仅改表单，未写入数据库）`
    : '表单字段均已填写，未覆盖任何值')
}

// FR-05：月供与剩余期数推导、按负债派生还款账单
const planMonthly = ref(
  Number(readPref('liabilityPlanMonthly', 0)) || Number(readPref('recurringRepayment', 0)) || 0
)
const planPay = computed(() =>
  Number(planMonthly.value) || Number(readPref('recurringRepayment', 0)) || 0
)
function remainPeriods(row) {
  const pay = planPay.value
  const principal = Number(row.remaining_principal) || 0
  if (!(pay > 0) || !(principal > 0)) return '—'
  return `${Math.ceil(principal / pay)} 期`
}
async function generateRepayments() {
  const pay = planPay.value
  if (!(pay > 0)) return message.warning('请先填写每期月供')
  writePref('liabilityPlanMonthly', pay)
  const list = (app.liabilities || []).filter(
    (l) => l.next_repay_date && Number(l.remaining_principal) > 0 && l.type !== 'monthly_fixed'
  )
  if (!list.length) return message.warning('没有可生成账单的分期 / 白条负债')
  const existing = new Set((app.repayments || []).map(
    (r) => `${String(r.due_date || '').slice(0, 10)}:${Number(r.amount) || 0}`
  ))
  const rows = []
  for (const l of list) {
    const base = new Date(`${String(l.next_repay_date).slice(0, 10)}T00:00:00`)
    if (!Number.isFinite(base.getTime())) continue
    for (let i = 0; i < 3; i++) {
      const d = new Date(base)
      d.setMonth(d.getMonth() + i)
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      const key = `${iso}:${pay}`
      if (existing.has(key)) continue
      existing.add(key)
      rows.push({ due_date: iso, amount: pay, status: 'pending' })
    }
  }
  if (!rows.length) return message.info('未来 3 期账单都已存在，无需重复生成')
  const ok = await run(async () => {
    for (const r of rows) await app.addRepayment(r)
    await app.load({ force: true })
  })
  if (ok) message.success(`已生成 ${rows.length} 期还款账单（已跳过重复）`)
}

// 新增负债表单的预估期数：纯前端推导，monthlyPayment 不进入任何写库 payload
const estRemainPeriods = computed(() => {
  const pay = Number(newLia.monthlyPayment)
  const principal = Number(newLia.remaining_principal)
  if (!Number.isFinite(pay) || pay <= 0 || !Number.isFinite(principal) || principal <= 0) return null
  return Math.ceil(principal / pay)
})

// 逾期判定：已标记逾期，或到期日在今天之前且尚未还清。todayISO 固定 GMT+8
const todayStr = todayISO()
const isOverdue = (row) => {
  if (row.status === 'overdue') return true
  return String(row.due_date || '').slice(0, 10) < todayStr && row.status !== 'paid'
}
const overdueDays = (row) => {
  const due = String(row.due_date || '').slice(0, 10)
  if (!isValidISODate(due)) return 0
  const diff = (new Date(`${todayStr}T00:00:00`) - new Date(`${due}T00:00:00`)) / 86400000
  return Math.max(0, Math.round(diff))
}

const expColumns = [
  { title: '名称', key: 'name', width: 140 },
  { title: '月金额', key: 'monthly_amount', width: 120, render: (r) => formatMoney(r.monthly_amount) },
  { title: '扣款日', key: 'deduct_day', width: 100, render: (r) => `每月 ${r.deduct_day} 日` },
  {
    title: '操作', key: 'action', width: 150,
    render: (row) => h('div', { style: 'display:flex; gap:6px; flex-wrap:wrap;' }, [
      h(NButton,
        { size: 'small', quaternary: true, disabled: saving.value, onClick: () => startEditExp(row) },
        { default: () => '编辑' }),
      h(NButton,
        { size: 'small', quaternary: true, type: 'error', disabled: saving.value, onClick: () => delExp(row) },
        { default: () => '删除' })
    ])
  }
]
const repayColumns = [
  { title: '还款日', key: 'due_date', width: 130, render: (r) => formatDateCN(r.due_date) },
  { title: '金额', key: 'amount', width: 110, render: (r) => formatMoney(r.amount) },
  {
    title: '状态', key: 'status', width: 170,
    render: (r) => {
      const label = REPAY_STATUS_LABEL[r.status] || r.status || '待还款'
      if (isOverdue(r)) {
        return h('span',
          { style: 'color: var(--c-danger, #EF4444); font-weight: 600;' },
          `${label} · 逾期 ${overdueDays(r)} 天`)
      }
      return h('span', null, label)
    }
  },
  {
    title: '操作', key: 'action', width: 300,
    render: (row) => h('div', { style: 'display:flex; gap:6px; flex-wrap:wrap;' }, [
      h(NButton, { size: 'small', quaternary: true, type: 'primary', disabled: saving.value, onClick: () => setRep(row, 'paid') }, { default: () => '标记已还' }),
      h(NButton, { size: 'small', quaternary: true, disabled: saving.value, onClick: () => setRep(row, 'pending') }, { default: () => '重置为待还' }),
      h(NButton, { size: 'small', quaternary: true, type: 'warning', disabled: saving.value, onClick: () => setRep(row, 'overdue') }, { default: () => '标记逾期' }),
      h(NButton, { size: 'small', quaternary: true, type: 'error', disabled: saving.value, onClick: () => delRep(row) }, { default: () => '删除' })
    ])
  }
]
const liabilityColumns = [
  { title: '类型', key: 'type', width: 100, render: (r) => LIABILITY_TYPE_LABEL[r.type] || r.type },
  { title: '总额', key: 'total', width: 110, render: (r) => formatMoney(r.total) },
  { title: '已还', key: 'paid', width: 110, render: (r) => formatMoney(r.paid) },
  { title: '剩余本金', key: 'remaining_principal', width: 120, render: (r) => formatMoney(r.remaining_principal) },
  { title: '手续费', key: 'fee', width: 100, render: (r) => formatMoney(r.fee) },
  { title: '预计剩余期数', key: 'periods', width: 120, render: (r) => remainPeriods(r) },
  { title: '下次还款', key: 'next_repay_date', width: 120, render: (r) => formatDateCN(r.next_repay_date) },
  { title: '状态', key: 'status', width: 100, render: (r) => LIABILITY_STATUS_LABEL[r.status] || r.status },
  {
    title: '操作', key: 'action', width: 150,
    render: (row) => h('div', { style: 'display:flex; gap:6px; flex-wrap:wrap;' }, [
      h(NButton,
        { size: 'small', quaternary: true, disabled: saving.value, onClick: () => startEditLia(row) },
        { default: () => '编辑' }),
      h(NButton,
        { size: 'small', quaternary: true, type: 'error', disabled: saving.value, onClick: () => delLia(row) },
        { default: () => '删除' })
    ])
  }
]

async function saveProfile() {
  const checked = validateProfile({
    city: form.city,
    hire_date: toLocalISODate(hireTs.value) || USER_DEFAULTS.hireDate,
    pay_day: form.pay_day,
    tax_threshold: form.tax_threshold,
    work_schedule: form.work_schedule
  })
  if (!checked.ok) return message.warning(checked.error)
  const ok = await run(() => app.saveProfile(checked.value))
  if (ok) message.success('基础信息已保存')
}

async function saveSalary() {
  const checked = validateSalary(sal)
  if (!checked.ok) return message.warning(checked.error)
  const ok = await run(async () => {
    await app.saveSalary(checked.value)
    await app.loadSalaryHistory()
  })
  if (ok) {
    message.success('已生成新的薪资档案版本')
    editing.value = false
  }
}

async function addExp() {
  const checked = validateExpense(newExp)
  if (!checked.ok) return message.warning(checked.error)
  const ok = await run(() => app.addExpense(checked.value))
  if (ok) {
    message.success('已添加')
    Object.assign(newExp, { name: '', monthly_amount: 0, deduct_day: 1 })
  }
}

async function delExp(row) {
  const ok = await run(() => app.delExpense(row.id))
  if (ok) message.success('已删除')
}

function startEditExp(row) {
  editingLia.value = null
  Object.assign(editExp, {
    id: row.id,
    name: row.name || '',
    monthly_amount: Number(row.monthly_amount) || 0,
    deduct_day: Number(row.deduct_day) || 1
  })
  editingExp.value = row.id
}

async function saveExp() {
  const checked = validateExpensePatch({
    name: editExp.name,
    monthly_amount: editExp.monthly_amount,
    deduct_day: editExp.deduct_day
  })
  if (!checked.ok) return message.warning(checked.error)
  const ok = await run(() => app.updateExpense(editExp.id, checked.value))
  if (ok) {
    message.success('已保存开支修改')
    editingExp.value = null
  }
}

async function addRep() {
  if (!newRep.date) return message.warning('请选择还款日')
  const checked = validateRepayment({
    due_date: toLocalISODate(newRep.date), amount: newRep.amount
  })
  if (!checked.ok) return message.warning(checked.error)
  const ok = await run(() => app.addRepayment(checked.value))
  if (ok) {
    message.success('已添加')
    Object.assign(newRep, { date: null, amount: 0 })
  }
}

async function delRep(row) {
  const ok = await run(() => app.delRepayment(row.id))
  if (ok) message.success('已删除')
}

async function setRep(row, status) {
  const ok = await run(() => app.setRepaymentStatus(row.id, status))
  if (ok) message.success(`已更新为「${REPAY_STATUS_LABEL[status]}」`)
}

async function addLia() {
  // 显式列出字段：monthlyPayment 只用于前端估算，绝不写入数据库
  const checked = validateLiability({
    type: newLia.type,
    status: newLia.status,
    total: newLia.total,
    paid: newLia.paid,
    remaining_principal: newLia.remaining_principal,
    fee: newLia.fee,
    next_repay_date: toLocalISODate(newLia.next_repay_date)
  })
  if (!checked.ok) return message.warning(checked.error)
  const ok = await run(() => app.addLiability(checked.value))
  if (ok) {
    message.success('已添加负债')
    Object.assign(newLia, {
      type: 'installment', status: 'normal', total: 0, paid: 0,
      remaining_principal: 0, fee: 0, monthlyPayment: 0, next_repay_date: null
    })
  }
}

function startEditLia(row) {
  editingExp.value = null
  Object.assign(editLia, {
    id: row.id,
    type: row.type || 'installment',
    status: row.status || 'normal',
    total: Number(row.total) || 0,
    paid: Number(row.paid) || 0,
    remaining_principal: Number(row.remaining_principal) || 0,
    fee: Number(row.fee) || 0,
    next_repay_date: isoDateToTimestamp(row.next_repay_date)
  })
  editingLia.value = row.id
}

async function saveLia() {
  const checked = validateLiabilityPatch({
    type: editLia.type,
    status: editLia.status,
    total: editLia.total,
    paid: editLia.paid,
    remaining_principal: editLia.remaining_principal,
    fee: editLia.fee,
    next_repay_date: toLocalISODate(editLia.next_repay_date)
  })
  if (!checked.ok) return message.warning(checked.error)
  const ok = await run(() => app.updateLiability(editLia.id, checked.value))
  if (ok) {
    message.success('已保存负债修改')
    editingLia.value = null
  }
}

async function delLia(row) {
  const ok = await run(() => app.delLiability(row.id))
  if (ok) message.success('已删除')
}

function addYtdRow() {
  const used = new Set((ytdRows.value || []).map((r) => Number(r.month)))
  const next = monthOptions.find((o) => !used.has(o.value))
  if (!next) return message.warning('12 个月都已添加')
  ytdRows.value = [...ytdRows.value, { month: next.value, preTax: 0, insuranceTotal: 0 }]
}

function removeYtd(index) {
  ytdRows.value = ytdRows.value.filter((_, i) => i !== index)
}

function saveYtd() {
  const checked = validateSalaryYtd(ytdRows.value)
  if (!checked.ok) return message.warning(checked.error)
  writeSalaryYtd(checked.value)
  ytdRows.value = checked.value
  message.success(`已保存 ${checked.value.length} 个月，仪表盘将按真实累计重算个税`)
}

function syncForm() {
  const p = app.profile
  form.city = p?.city || USER_DEFAULTS.city
  form.pay_day = p?.pay_day ?? USER_DEFAULTS.payDay
  form.tax_threshold = p?.tax_threshold ?? USER_DEFAULTS.taxThreshold
  form.work_schedule = p?.work_schedule === 'single' ? 'single' : 'double'
  hireTs.value = isoDateToTimestamp(hireDate.value)

  const sc = app.salaryConfig
  sal.pre_tax_salary = sc?.pre_tax_salary ?? 0
  sal.sb_base_pension = sc?.sb_base_pension ?? SOCIAL_BASES.sb_base_pension
  sal.sb_base_medical = sc?.sb_base_medical ?? SOCIAL_BASES.sb_base_medical
  sal.sb_base_unemploy = sc?.sb_base_unemploy ?? SOCIAL_BASES.sb_base_unemploy
  sal.sb_base_fund = sc?.sb_base_fund ?? SOCIAL_BASES.sb_base_fund
}

async function loadData() {
  loadError.value = ''
  try {
    await auth.ensureReady()
    await app.load()
    await app.loadSalaryHistory()
    syncForm()
  } catch (e) {
    loadError.value = e?.message || '未知错误'
    message.error(loadError.value)
  }
}

onMounted(loadData)
</script>

<style scoped>
/* ===== 双栏骨架：顶部页身份 + 左常驻分区导航 + 右内容 ===== */
.set-head {
  max-width: 760px;
  margin-bottom: 22px;
}
.set-eyebrow {
  display: inline-block;
  font-size: var(--fs-caption);
  letter-spacing: .14em;
  color: var(--c-primary);
  margin-bottom: 6px;
}
.set-title {
  font-size: var(--fs-display);
  font-weight: 700;
  line-height: 1.08;
  margin: 0;
  color: var(--c-text);
}
.set-desc {
  margin: 8px 0 0;
  font-size: var(--fs-body);
  color: var(--c-text-2);
  line-height: 1.6;
}
.set-layout {
  display: grid;
  grid-template-columns: 200px minmax(0, 1fr);
  gap: 28px;
  align-items: start;
}
.set-rail-inner {
  position: sticky;
  top: 16px;
}
.set-rail-label {
  display: block;
  font-size: var(--fs-micro);
  letter-spacing: .12em;
  color: var(--c-text-2);
  text-transform: uppercase;
  margin-bottom: 10px;
}
.set-nav { display: flex; flex-direction: column; gap: 2px; }
.set-nav-link {
  display: block;
  padding: 8px 12px;
  border-left: 2px solid transparent;
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
  font-size: var(--fs-body);
  color: var(--c-text-2);
  text-decoration: none;
  cursor: pointer;
  transition: color var(--dur-fast) var(--ease-out), background var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out);
}
.set-nav-link:hover {
  color: var(--c-text);
  background: var(--c-hover);
  border-left-color: var(--c-primary);
}
.set-main { min-width: 0; }
.set-section { scroll-margin-top: 16px; margin-bottom: 28px; }
.set-section-head { margin-bottom: 14px; }
.set-section-title {
  font-size: var(--fs-title);
  font-weight: 700;
  margin: 0;
  color: var(--c-text);
}
.set-section-desc {
  margin: 4px 0 0;
  font-size: var(--fs-caption);
  color: var(--c-text-2);
}

/* ===== 本页特有：档案网格 / 编辑表单 / 历史行 / 规则表 / 年内校准表单 ===== */
.archive-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px 18px; }
.arch-item { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.arch-item span { font-size: var(--fs-caption); color: var(--c-text-2); }
.arch-item b { font-size: var(--fs-body); font-weight: 600; word-break: break-all; }
.archive-foot {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  margin-top: 16px; padding-top: 14px; border-top: 1px solid var(--c-border); flex-wrap: wrap;
}
.archive-hint { font-size: var(--fs-caption); }
.sub-title { font-size: var(--fs-section); font-weight: 700; margin: 0 0 12px; color: var(--c-text); }
.form-actions { display: flex; gap: 10px; margin-top: 14px; flex-wrap: wrap; }
.preview { margin-top: 12px; font-size: 13px; }
.history-row {
  display: flex; gap: 12px; align-items: center; flex-wrap: wrap;
  padding: 9px 0; border-bottom: 1px solid var(--c-border); font-size: 13px;
}
.history-row:last-child { border-bottom: 0; }
.hist-tag {
  font-size: var(--fs-micro); padding: 2px 8px; border-radius: var(--r-sm);
  color: var(--c-text-2); background: var(--c-hover);
}
.hist-tag.current { color: var(--c-primary); background: var(--c-primary-soft); }
.edit-row { display: flex; gap: 10px; margin-top: 14px; align-items: center; flex-wrap: wrap; }
.preset-preview {
  margin-top: 12px; padding: 10px 12px; border: 1px solid var(--c-border);
  border-radius: var(--radius-sm); background: var(--c-surface-2);
}
.preset-line { font-size: 13px; line-height: 1.9; }
.rule-notes { margin-top: 10px; border: 1px solid var(--c-border); border-radius: var(--radius-sm); overflow: hidden; }
.rule-note {
  display: grid; grid-template-columns: 140px 130px minmax(0, 1fr); gap: 10px;
  padding: 6px 10px; font-size: var(--fs-caption); border-bottom: 1px solid var(--c-border);
}
.rule-note:last-child { border-bottom: 0; }
.rule-note-head { color: var(--c-text-2); background: var(--c-surface-2); font-weight: 700; }
.ytd-head, .ytd-row {
  display: grid; grid-template-columns: 100px minmax(0, 1fr) minmax(0, 1fr) 80px;
  gap: 10px; align-items: center; margin-bottom: 8px;
}
.ytd-head { font-size: var(--fs-caption); color: var(--c-text-2); }

@media (max-width: 900px) {
  .set-layout { grid-template-columns: 1fr; gap: 18px; }
  .set-rail-inner { position: static; }
  .set-nav { flex-direction: row; flex-wrap: wrap; gap: 6px; }
  .set-nav-link { border-left: 0; border-bottom: 2px solid transparent; border-radius: var(--radius-sm); }
  .set-nav-link:hover { border-left-color: transparent; border-bottom-color: var(--c-primary); }
  .archive-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 768px) {
  .archive-grid { gap: 10px 12px; }
  .arch-item b { font-size: 13px; }
  .settings-row > *, .edit-row > * { flex: 1 1 140px; }
  .rule-note { grid-template-columns: 1fr 1fr; }
  .rule-note > :last-child { grid-column: 1 / -1; }
  .ytd-head { display: none; }
  .ytd-row { grid-template-columns: 80px minmax(0, 1fr) minmax(0, 1fr); }
  .ytd-row > :last-child { grid-column: 1 / -1; }
  .form-actions { gap: 8px; }
  .settings-note { font-size: var(--fs-micro); }
}
</style>
