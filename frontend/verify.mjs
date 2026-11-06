// ============================================================
// 引擎与数据校验回归测试
// 用 esbuild 把源码打成自包含 ESM 后以 data URL 导入，无需临时文件。
// 运行：npm run verify
// 任何金额 / 日期 / 校验口径的改动都先跑这里，防止算错还不自知。
// ============================================================
import { build } from 'esbuild'
import assert from 'node:assert/strict'

async function load(entry) {
  const result = await build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    logLevel: 'silent'
  })
  const code = result.outputFiles[0].text
  return import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'))
}

let passed = 0
let failed = 0
function check(name, fn) {
  try {
    fn()
    console.log('  ✓', name)
    passed++
  } catch (e) {
    console.error('  ✗', name, '\n     ', e.message)
    failed++
  }
}

const engine = await load('src/composables/useCashflow.js')
const date = await load('src/lib/date.js')
const labels = await load('src/lib/labels.js')
const val = await load('src/lib/validation.js')
const {
  calcNetSalary, computeCashflow, computeMultiMonth, serviceMonthIndex
} = engine

const cfg = {
  pre_tax_salary: 6000,
  sb_base_pension: 4552,
  sb_base_medical: 4498,
  sb_base_unemploy: 4498,
  sb_base_fund: 2400
}

console.log('\n【薪资与个税】')
check('武汉口径五险一金合计 666.61', () => {
  assert.equal(calcNetSalary(cfg).insuranceTotal, 666.61)
})
check('6000 薪资第 5 任职月：到手 5323.39、个税 10', () => {
  const r = calcNetSalary(cfg, { monthIndex: 5 })
  assert.equal(r.net, 5323.39)
  assert.equal(r.tax, 10)
})
check('累计预扣法：2 万薪资第 5 月个税 1433.33（按月简化约 430）', () => {
  assert.equal(calcNetSalary({ ...cfg, pre_tax_salary: 20000 }, { monthIndex: 5 }).tax, 1433.33)
})
check('个税起征点可配置：改为 8000 时个税为 0', () => {
  assert.equal(calcNetSalary(cfg, { monthIndex: 5, taxThreshold: 8000 }).tax, 0)
})
check('传入真实历史月份时按调薪后实际累计重算', () => {
  const ytd = [4000, 4000, 4000, 4000].map((preTax) => ({ preTax, insuranceTotal: 666.61 }))
  const precise = calcNetSalary(cfg, { monthIndex: 5, ytdMonths: ytd })
  const approx = calcNetSalary(cfg, { monthIndex: 5 })
  assert.equal(precise.tax, 0)
  assert.equal(approx.tax, 10)
})
check('空薪资档案兜底为 0，不出现负到手', () => {
  assert.equal(calcNetSalary({}).net, 0)
  assert.equal(calcNetSalary(null).net, 0)
})
check('任职月数：2026-07-13 入职，11 月为第 5 月', () => {
  assert.equal(serviceMonthIndex(2026, 11, '2026-07-13'), 5)
})
check('跨自然年重新累计：2027 年 3 月为第 3 月', () => {
  assert.equal(serviceMonthIndex(2027, 3, '2026-07-13'), 3)
})

console.log('\n【现金流推演】')
check('发薪日固定当天：2026-11-15 是周日，仍在 15 日到账', () => {
  const r = computeCashflow({
    year: 2026, month: 11, payDay: 15, startBalance: 1000,
    scenarios: [{ label: '当前薪资', net: 5000 }]
  })
  assert.equal(r.effPayDay, 15)
  assert.equal(r.events.find((e) => e.type === 'pay').day, 15)
})
check('还款不顺延：周日照常按账单日扣款', () => {
  const r = computeCashflow({
    year: 2026, month: 11, payDay: 15, startBalance: 10000,
    scenarios: [{ label: '当前薪资', net: 5000 }],
    repayments: [{ date: '2026-11-15', name: '还款', amount: 100 }]
  })
  assert.equal(r.events.find((e) => e.type === 'repay').day, 15)
})
check('浮点累加不漂移：0.3 − 0.1 − 0.2 = 0', () => {
  const r = computeCashflow({
    year: 2026, month: 11, payDay: 1, startBalance: 0,
    scenarios: [{ label: '当前薪资', net: 0.3 }],
    expenses: [
      { day: 2, name: '测试一', amount: 0.1 },
      { day: 2, name: '测试二', amount: 0.2 }
    ]
  })
  assert.equal(r.monthEnd, 0)
})
check('风险提示按事件聚合且各不相同', () => {
  const r = computeCashflow({
    year: 2026, month: 11, payDay: 15, startBalance: 465,
    scenarios: [{ label: '当前薪资', net: 4333.39 }],
    expenses: [{ day: 5, name: '房租', amount: 1500 }],
    repayments: [{ date: '2026-11-25', name: '白条', amount: 3619.44 }]
  })
  assert.ok(r.warnings.length > 1)
  assert.equal(new Set(r.warnings.map((w) => w.title)).size, r.warnings.length)
  assert.ok(r.warnings.every((w) => w.detail && w.advice))
})
check('多月滚动：上月结余等于下月期初，且跨年连续', () => {
  const list = computeMultiMonth({
    year: 2026, month: 11, months: 4, startBalance: 1000,
    salaryConfig: cfg, expenses: [], repayments: []
  })
  assert.equal(list.length, 4)
  assert.equal(list[1].startBalance, list[0].endBalance)
  assert.equal(list[2].startBalance, list[1].endBalance)
  assert.equal(list[3].label, '2027年2月')
})

console.log('\n【日期与时区】')
check('本地日期格式化不发生 UTC 偏移', () => {
  assert.equal(date.toLocalISODate(new Date(2026, 10, 15)), '2026-11-15')
})
check('回显时间戳再格式化保持不变', () => {
  const ts = date.isoDateToTimestamp('2026-11-15')
  assert.equal(date.toLocalISODate(ts), '2026-11-15')
})
check('拒绝不存在的日期 2026-02-30', () => {
  assert.equal(date.isValidISODate('2026-02-30'), false)
})
check('接受合法日期 2026-11-15', () => {
  assert.equal(date.isValidISODate('2026-11-15'), true)
})
check('2026 年 2 月月末为 28 日', () => {
  assert.equal(date.monthRangeISO(2026, 2).end, '2026-02-28')
})
check('todayISO 为 YYYY-MM-DD 且落在亚洲上海时区', () => {
  const s = date.todayISO()
  assert.match(s, /^\d{4}-\d{2}-\d{2}$/)
  const shanghai = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date())
  assert.equal(s, shanghai)
})
check('formatDateTimeCN：强制 GMT+8 + 24 小时制，无 AM/PM', () => {
  const out = labels.formatDateTimeCN(Date.parse('2026-11-04T15:00:00Z'))
  // 15:00 UTC + 8 = 同日 23:00（上海）
  assert.equal(out, '2026-11-04 23:00')
  assert.match(out, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)
  assert.ok(!/AM|PM|上午|下午/.test(out))
})
check('formatDateTimeCN：非整点也保持 24 小时制', () => {
  const out = labels.formatDateTimeCN(Date.parse('2026-06-01T01:30:00Z'))
  assert.equal(out, '2026-06-01 09:30')
})

console.log('\n【写入校验】')
check('round2 消除 0.1 + 0.2 误差', () => {
  assert.equal(val.round2(0.1 + 0.2), 0.3)
})
check('合法交易通过且金额保留两位、来源保留', () => {
  const r = val.validateTransaction({
    txn_date: '2026-11-15', direction: 'income',
    category: '工资', amount: '123.456', note: '', source: 'ai'
  })
  assert.equal(r.ok, true)
  assert.equal(r.value.amount, 123.46)
  assert.equal(r.value.source, 'ai')
})
check('中文方向「收入」直接写入会被拒绝', () => {
  assert.equal(val.validateTransaction({
    txn_date: '2026-11-15', direction: '收入', category: '工资', amount: 1
  }).ok, false)
})
check('模型返回的「昨天」等相对日期被拒绝', () => {
  assert.equal(val.validateTransaction({
    txn_date: '昨天', direction: 'expense', category: '餐饮', amount: 45
  }).ok, false)
})
check('0 / 负数 / 非数字金额被拒绝', () => {
  for (const amount of [0, -5, 'abc', NaN]) {
    assert.equal(val.validateTransaction({
      txn_date: '2026-11-15', direction: 'expense', category: '餐饮', amount
    }).ok, false)
  }
})
check('发薪日越界被拒绝', () => {
  assert.equal(val.validateProfile({
    city: '武汉江汉区', pay_day: 32, tax_threshold: 5000, hire_date: '2026-07-13'
  }).ok, false)
})
check('还款日期非法被拒绝', () => {
  assert.equal(val.validateRepayment({ due_date: '2026-02-30', amount: 100 }).ok, false)
})
check('薪资字段缺失被拒绝', () => {
  assert.equal(val.validateSalary({ pre_tax_salary: 6000 }).ok, false)
})
check('超长分类被明确拒绝（不静默截断，避免丢数据）', () => {
  const r = val.validateTransaction({
    txn_date: '2026-11-15', direction: 'expense',
    category: '餐'.repeat(100), amount: 10
  })
  assert.equal(r.ok, false)
})
check('恰好 40 字分类可通过', () => {
  const r = val.validateTransaction({
    txn_date: '2026-11-15', direction: 'expense',
    category: '餐'.repeat(40), amount: 10
  })
  assert.equal(r.ok, true)
  assert.equal(r.value.category.length, 40)
})
check('超长开支名称与备注被拒绝', () => {
  assert.equal(val.validateExpense({ name: '租'.repeat(50), monthly_amount: 100, deduct_day: 1 }).ok, false)
  assert.equal(val.validateTransaction({
    txn_date: '2026-11-15', direction: 'expense', category: '餐饮', amount: 10, note: 'x'.repeat(300)
  }).ok, false)
})

console.log('\n【统一推演与新增校验】')
const projection = await load('src/composables/useProjection.js')
check('统一推演入口：同一份档案只产出一个预测值', () => {
  const mockApp = {
    profile: { hire_date: '2026-07-13', pay_day: 15, tax_threshold: 5000 },
    salaryConfig: cfg,
    expenses: [{ deduct_day: 1, name: '房租', monthly_amount: 1500 }],
    repayments: [{ due_date: '2026-11-25', amount: 800 }]
  }
  const opts = { app: mockApp, startBalance: 1000, year: 2026, month: 11, months: 3 }
  const a = projection.buildProjection(opts)
  const b = projection.buildProjection(opts)
  assert.equal(a.cf.monthEnd, b.cf.monthEnd)
  assert.equal(a.forecast.length, 3)
  assert.equal(a.cf.effPayDay, 15)
})
check('统一推演入口：对账与仪表盘共用同一份当月还款', () => {
  const mockApp = {
    profile: { pay_day: 15, tax_threshold: 5000 },
    salaryConfig: cfg,
    expenses: [],
    repayments: [
      { due_date: '2026-11-25', amount: 800 },
      { due_date: '2026-12-25', amount: 900 }
    ]
  }
  const r = projection.buildProjection({ app: mockApp, startBalance: 1000, year: 2026, month: 11, months: 1 })
  const repayEvents = r.cf.events.filter((e) => e.type === 'repay')
  assert.equal(repayEvents.length, 1)
  assert.equal(repayEvents[0].day, 25)
})
check('日历数据源：当月 daily 长度等于天数且含发薪事件', () => {
  const mockApp = {
    profile: { pay_day: 15, tax_threshold: 5000 },
    salaryConfig: cfg, expenses: [], repayments: []
  }
  const r = projection.buildProjection({ app: mockApp, startBalance: 1000, year: 2026, month: 11, months: 1 })
  assert.equal(r.cf.daily.length, 30) // 2026-11 共 30 天
  assert.equal(r.cf.events.some((e) => e.type === 'pay' && e.day === 15), true)
})
check('负债：已还或剩余本金超过总额被拒绝', () => {
  const base = { type: 'installment', total: 1000, paid: 0, remaining_principal: 0, fee: 0 }
  assert.equal(val.validateLiability({ ...base, paid: 1200 }).ok, false)
  assert.equal(val.validateLiability({ ...base, remaining_principal: 1200 }).ok, false)
})
check('负债：合法数据通过且状态与日期保留', () => {
  const r = val.validateLiability({
    type: 'white_bar', total: 5823.96, paid: 2223.96,
    remaining_principal: 3600, fee: 19.44,
    next_repay_date: '2026-11-25', status: 'deferred'
  })
  assert.equal(r.ok, true)
  assert.equal(r.value.status, 'deferred')
  assert.equal(r.value.next_repay_date, '2026-11-25')
})
check('年内历史薪资：月份重复被拒绝', () => {
  const rows = [
    { month: 7, preTax: 4000, insuranceTotal: 666 },
    { month: 7, preTax: 4000, insuranceTotal: 666 }
  ]
  assert.equal(val.validateSalaryYtd(rows).ok, false)
})
check('年内历史薪资：按月份升序输出并保留两位', () => {
  const r = val.validateSalaryYtd([
    { month: 9, preTax: 4000.126, insuranceTotal: 666 },
    { month: 7, preTax: 4000, insuranceTotal: 666 }
  ])
  assert.equal(r.ok, true)
  assert.equal(r.value[0].month, 7)
  assert.equal(r.value[1].preTax, 4000.13)
})

console.log('\n【组件注册清单】')
const fs = await import('node:fs')
const path = await import('node:path')

function collectVueFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return collectVueFiles(full)
    return entry.name.endsWith('.vue') ? [full] : []
  })
}

check('所有模板用到的 Naive UI 组件都已注册（按需引入零遗漏）', () => {
  const mainSrc = fs.readFileSync('src/main.js', 'utf8')
  const block = mainSrc.match(/const components = \{([\s\S]*?)\}/)
  assert.ok(block, 'main.js 里找不到组件注册清单')
  const registered = new Set([...block[1].matchAll(/\bN[A-Z][A-Za-z]+\b/g)].map((m) => m[0]))

  const used = new Set()
  for (const file of collectVueFiles('src')) {
    const src = fs.readFileSync(file, 'utf8')
    const template = src.split('<script')[0]
    for (const m of template.matchAll(/<n-([a-z-]+)/g)) {
      const name = 'N' + m[1].split('-').map((s) => s[0].toUpperCase() + s.slice(1)).join('')
      used.add(name)
    }
  }
  assert.ok(used.size >= 15, `只扫描到 ${used.size} 个组件，正则可能失效`)
  const missing = [...used].filter((n) => !registered.has(n))
  assert.deepEqual(missing, [], `未注册组件：${missing.join('、')}`)
})

check('Tab 标签使用 tab / label，而非组件库不认的 title 属性', () => {
  const bad = []
  for (const file of collectVueFiles('src')) {
    const src = fs.readFileSync(file, 'utf8')
    const template = src.split('<script')[0]
    for (const m of template.matchAll(/<n-tab-pane[^>]*>/g)) {
      if (/\btitle=/.test(m[0]) && !/\btab=/.test(m[0])) bad.push(path.basename(file))
    }
  }
  assert.deepEqual(bad, [], `Tab 使用了无效 title 属性：${bad.join('、')}`)
})

console.log('\n【重复扣款 · 对账容差 · 基准预填】')
const rec = await load('src/lib/reconcile.js')
const base = await load('src/lib/baseline.js')

const realRepayments = [
  { date: '2026-11-15', amount: 241 },
  { date: '2026-11-25', amount: 3619.44 }
]
const multiArgs = {
  startBalance: 465, year: 2026, month: 11, months: 3, payDay: 15,
  salaryConfig: { ...cfg, pre_tax_salary: 5000 },
  expenses: [{ day: 1, name: '月固定开支', amount: 1179 }],
  repayments: realRepayments
}

check('多月前瞻：当月已录入同额月供时不再重复扣 241', () => {
  const withFix = computeMultiMonth({ ...multiArgs, recurringRepayment: 241 })
  const without = computeMultiMonth({ ...multiArgs, recurringRepayment: 0 })
  assert.equal(withFix[0].endBalance, without[0].endBalance,
    '填了每月固定还款不应改变已录入账单的当月结余')
})

check('多月前瞻：首月结余与当月单月推演完全一致', () => {
  const first = computeMultiMonth({ ...multiArgs, recurringRepayment: 241 })[0]
  const net = calcNetSalary(multiArgs.salaryConfig, { monthIndex: 5 }).net
  const cf = computeCashflow({
    startBalance: 465, year: 2026, month: 11, payDay: 15,
    scenarios: [{ label: '当前薪资', net }], mainLabel: '当前薪资',
    expenses: multiArgs.expenses,
    repayments: realRepayments.map((r) => ({ ...r, name: '还款' }))
  })
  assert.equal(first.endBalance, cf.monthEnd)
})

check('多月前瞻：未来未录入月份仍会补齐固定月供', () => {
  const withFix = computeMultiMonth({ ...multiArgs, recurringRepayment: 241 })
  const without = computeMultiMonth({ ...multiArgs, recurringRepayment: 0 })
  assert.ok(Math.abs(withFix[1].endBalance - (without[1].endBalance - 241)) < 0.001)
})

check('对账容差：分角差异视为同一笔，超出容差才提示未匹配', () => {
  assert.equal(rec.withinTolerance(100, 100.5, 1), true)
  assert.equal(rec.withinTolerance(100, 102, 1), false)
  assert.equal(rec.withinTolerance(100, 100, 0), true)
  assert.equal(rec.withinTolerance('abc', 100, 1), false)
})

check('对账容差：非法值回退默认、超上限收敛', () => {
  assert.equal(rec.normalizeTolerance(-1), rec.DEFAULT_TOLERANCE)
  assert.equal(rec.normalizeTolerance('abc'), rec.DEFAULT_TOLERANCE)
  assert.equal(rec.normalizeTolerance(99999), 1000)
})

check('未匹配事件：忽略发薪、按日期与容差匹配', () => {
  const events = [
    { day: 15, label: '工资', amount: 4333.39, type: 'pay' },
    { day: 15, label: '手机分期', amount: 241, type: 'repay' },
    { day: 25, label: '白条', amount: 3619.44, type: 'repay' }
  ]
  const txns = [{ txn_date: '2026-11-15', amount: 240.6 }]
  const out = rec.findUnmatchedEvents(events, txns, '2026-11', 1)
  assert.equal(out.length, 1)
  assert.equal(out[0].label, '白条')
  assert.equal(out[0].date, '2026-11-25')
})

check('基准预填：空参数全部写入，且只生成本机偏好', () => {
  const p = base.planBaselinePreset({ startBalance: 0, recurringRepayment: 0, salaryYtd: [] })
  assert.equal(p.values.startBalance, 465)
  assert.equal(p.values.recurringRepayment, 241)
  assert.equal(p.values.salaryYtd.length, 4)
  assert.equal(p.applied.length, 3)
  assert.equal(p.skipped.length, 0)
})

check('基准预填：任何已填的值都保留，绝不静默覆盖', () => {
  const p = base.planBaselinePreset({
    startBalance: 999, recurringRepayment: 300,
    salaryYtd: [{ month: 8, preTax: 4000, insuranceTotal: 700 }]
  })
  assert.deepEqual(p.values, {})
  assert.equal(p.skipped.length, 3)
})

check('基准预填：7 月留空，8-10 月五险一金含每月 54 元补差', () => {
  const rows = base.BASELINE_PRESET.salaryYtd
  assert.equal(rows[0].preTax, 0)
  assert.equal(rows[1].insuranceTotal, 716.29)
  assert.equal(rows[2].insuranceTotal, 720.61)
  assert.equal(rows[3].insuranceTotal, 720.61)
})

check('基准核对：真实数据齐全时通过，缺项逐条列出', () => {
  const full = base.baselineAlignment({
    salaryConfig: { pre_tax_salary: 5000 },
    expenses: [1048, 50, 65, 16].map((amount) => ({ monthly_amount: amount })),
    repayments: realRepayments.map((r) => ({ due_date: r.date, amount: r.amount })),
    liabilities: [{}, {}, {}], pending: [{}, {}, {}]
  })
  assert.equal(full.aligned, true)
  assert.equal(full.checked.length, 6)
  const partial = base.baselineAlignment({
    salaryConfig: { pre_tax_salary: 6000 },
    expenses: [], repayments: [], liabilities: [], pending: []
  })
  assert.equal(partial.aligned, false)
  assert.ok(partial.diffs.some((d) => d.label === '税前月薪'))
})

check('基准核对：非基准月份不校验 11 月账单，避免跨月误报', () => {
  const r = base.baselineAlignment({
    salaryConfig: {}, expenses: [], repayments: [], liabilities: [], pending: [],
    nowYear: 2027, nowMonth: 3
  })
  assert.equal(r.checked.length, 4)
})

check('种子 SQL 的枚举值都有中文映射，不会显示英文原值', () => {
  const sql = fs.readFileSync('../supabase/0002_real_data_seed.sql', 'utf8')
  const labels = fs.readFileSync('src/lib/labels.js', 'utf8')
  const enums = ['regular', 'open', 'unreceived', 'reviewing',
    'white_bar', 'installment', 'monthly_fixed', 'deferred', 'normal']
  const missing = enums.filter((e) => !sql.includes(`'${e}'`) || !labels.includes(`${e}:`))
  assert.deepEqual(missing, [], `缺少映射或未落库：${missing.join('、')}`)
})

console.log('\n【AI 草稿清单】')
const aid = await load('src/lib/aiDraft.js')
const draftBase = {
  txn_date: '2026-11-04', direction: 'expense', category: '餐饮',
  amount: 45, note: '午饭', source: 'ai', confidence: 0.9, selected: true
}
const mkDraft = (o = {}) => ({ ...draftBase, ...o })

check('AI 结果：旧版单对象仍兼容为 1 条草稿', () => {
  const items = aid.normalizeAiResult({
    result: { date: '2026-11-03', direction: '支出', category: '餐饮', amount: 45, note: '快餐', confidence: 0.9 },
    draft: false
  })
  assert.equal(items.length, 1)
  assert.equal(items[0].txn_date, '2026-11-03')
  assert.equal(items[0].source, 'ai')
})

check('AI 结果：多笔数组逐条列出，不合并金额', () => {
  const items = aid.normalizeAiResult({
    result: [
      { date: '2026-11-03', direction: '支出', category: '餐饮', amount: 45 },
      { date: '2026-11-03', direction: '支出', category: '通勤', amount: 23 }
    ]
  })
  assert.equal(items.length, 2)
  assert.equal(items[0].amount, 45)
  assert.equal(items[1].amount, 23)
  assert.notEqual(items[0].id, items[1].id)
})

check('AI 结果：{items:[]} 结构与空结果都不炸', () => {
  assert.equal(aid.normalizeAiResult({ items: [{ date: '2026-11-04', amount: 3 }] }).length, 1)
  assert.equal(aid.normalizeAiResult({ result: { items: [{ amount: 3 }] } }).length, 1)
  assert.equal(aid.normalizeAiResult({}).length, 0)
  assert.equal(aid.normalizeAiResult(null).length, 0)
})

check('AI 结果：中文方向映射为英文枚举，避免脏数据入库', () => {
  const items = aid.normalizeAiResult({ result: [
    { date: '2026-11-04', direction: '收入', amount: 100 },
    { date: '2026-11-04', direction: '支出', amount: 20 }
  ] })
  assert.equal(items[0].direction, 'income')
  assert.equal(items[1].direction, 'expense')
})

check('草稿校验：非法日期 / 中文方向 / 0 金额 / 分类与备注皆空被拒绝', () => {
  assert.equal(aid.validateDraft(mkDraft({ txn_date: '2026-02-30' })).ok, false)
  assert.equal(aid.validateDraft(mkDraft({ direction: '支出' })).ok, false)
  assert.equal(aid.validateDraft(mkDraft({ amount: 0 })).ok, false)
  assert.equal(aid.validateDraft(mkDraft({ category: '', note: '' })).ok, false)
  // 仅分类留空、备注可判类时自动归一，不再把用户卡在「分类不能为空」
  assert.equal(aid.validateDraft(mkDraft({ category: '' })).value.category, '午餐')
})

check('草稿校验：合法条目保留来源并归一金额', () => {
  const r = aid.validateDraft(mkDraft({ amount: 45.666, source: 'ai' }))
  assert.equal(r.ok, true)
  assert.equal(r.value.amount, 45.67)
  assert.equal(r.value.source, 'ai')
  assert.equal(aid.validateDraft(mkDraft({ source: 'manual' })).value.source, 'manual')
})

check('待写入清单：只取已勾选且合法的条目，非法项单独列出', () => {
  const list = [
    mkDraft({ id: 'a' }),
    mkDraft({ id: 'b', amount: 0 }),
    mkDraft({ id: 'c', selected: false })
  ]
  const r = aid.collectWritable(list)
  assert.deepEqual(r.writable.map((w) => w.id), ['a'])
  assert.deepEqual(r.invalid.map((w) => w.id), ['b'])
})

check('待写入清单：指定单笔时忽略勾选状态，且只写这一笔', () => {
  const list = [mkDraft({ id: 'a' }), mkDraft({ id: 'b', selected: false })]
  const r = aid.collectWritable(list, 'b')
  assert.deepEqual(r.writable.map((w) => w.id), ['b'])
})

check('手动新增：默认今天、支出、来源 manual、默认勾选', () => {
  const d = aid.makeBlankDraft()
  assert.equal(d.txn_date, date.todayISO())
  assert.equal(d.direction, 'expense')
  assert.equal(d.source, 'manual')
  assert.equal(d.selected, true)
  assert.equal(d.amount, null)
})

check('低置信识别：仅 <0.7 标黄，缺失不误报', () => {
  assert.equal(aid.isLowConfidence(mkDraft({ confidence: 0.6 })), true)
  assert.equal(aid.isLowConfidence(mkDraft({ confidence: 0.9 })), false)
  assert.equal(aid.isLowConfidence(mkDraft({ confidence: null })), false)
})

// ============================================================
// 日历数据严格性：日期 / 节假日 / 分摊守恒 / 跨页口径一致
// 这一节专门锁死「日历里的数据对不上」这一类问题，任何口径改动都会在这里暴露
// ============================================================
console.log('\n【日历数据严格性】')
const proj = await load('src/composables/useProjection.js')
const hol = await load('src/lib/holidays2026.js')
const { readFileSync } = await import('node:fs')

const realApp = {
  profile: { hire_date: '2026-07-13', pay_day: 15, tax_threshold: 5000 },
  salaryConfig: {
    pre_tax_salary: 5000, sb_base_pension: 4552,
    sb_base_medical: 4498, sb_base_unemploy: 4498, sb_base_fund: 2400
  },
  expenses: [
    { name: '餐饮', monthly_amount: 1048, deduct_day: 1 },
    { name: '零食机动', monthly_amount: 50, deduct_day: 1 },
    { name: '话费', monthly_amount: 65, deduct_day: 1 },
    { name: '共享单车月卡', monthly_amount: 16, deduct_day: 1 }
  ],
  repayments: [
    { due_date: '2026-11-15', amount: 241 },
    { due_date: '2026-11-25', amount: 3619.44 }
  ]
}
const auditArgs = {
  app: realApp, startBalance: 465, recurringRepayment: 241,
  baseYear: 2026, baseMonth: 11
}

check('星期表头与日期排布严格对齐（2026-11-01 必须落在「日」列）', () => {
  const src = readFileSync('src/views/Calendar.vue', 'utf8')
  assert.match(src, /const weekLabels = \['一', '二', '三', '四', '五', '六', '日'\]/)
  assert.doesNotMatch(src, /weekOrder/, '表头不得再按错位的 weekOrder 取下标')
  const labels = ['一', '二', '三', '四', '五', '六', '日']
  const firstDow = (new Date(2026, 10, 1).getDay() + 6) % 7
  assert.equal(labels[firstDow], '日')
  assert.equal(new Date(2026, 10, 1).getDay(), 0)
})

check('2026 法定节假日与调休补班日逐条等于国务院通知', () => {
  const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const ranges = [
    ['01-01', '01-03'], ['02-15', '02-23'], ['04-04', '04-06'],
    ['05-01', '05-05'], ['06-19', '06-21'], ['09-25', '09-27'], ['10-01', '10-07']
  ]
  const expected = []
  for (const [s, e] of ranges) {
    const end = new Date(`2026-${e}T00:00:00`)
    const d = new Date(`2026-${s}T00:00:00`)
    while (d <= end) { expected.push(fmt(d)); d.setDate(d.getDate() + 1) }
  }
  assert.equal(expected.length, 33)
  assert.deepEqual([...hol.HOLIDAY_LEGAL_2026].sort(), expected.sort())
  assert.deepEqual(
    [...hol.HOLIDAY_MAKEUP_2026].sort(),
    ['2026-01-04', '2026-02-14', '2026-02-28', '2026-05-09', '2026-09-20', '2026-10-10'].sort()
  )
})

check('日历属性判定：补班 / 法定假 / 周末发薪 / 普通工作日', () => {
  assert.equal(hol.classifyDay('2026-01-04'), 'makeup')
  assert.equal(hol.classifyDay('2026-02-15'), 'legal')
  assert.equal(hol.classifyDay('2026-11-15'), 'weekend')
  assert.equal(hol.classifyDay('2026-11-25'), 'workday')
  assert.equal(hol.classifyDay('2027-01-01'), 'legal')
})

check('按日均摊：28/29/30/31 天月份全月合计精确守恒，一分不丢', () => {
  const r2 = (n) => Math.round(n * 100) / 100
  for (const [y, m, days] of [[2026, 2, 28], [2028, 2, 29], [2026, 11, 30], [2026, 12, 31]]) {
    const r = engine.computeCashflow({
      startBalance: 100000, year: y, month: m, payDay: 15,
      scenarios: [{ label: 'x', net: 0 }], mainLabel: 'x',
      expenses: [{ day: 1, name: '餐饮', amount: 1048, spread: true }]
    })
    assert.equal(r.daily.length, days)
    const total = r.daily.reduce((s, d) => s + d.outflow, 0)
    assert.equal(r2(total), 1048, `${y}-${m} 合计应为 1048`)
    assert.ok(r.daily.every((d) => d.outflow > 0), '每天都应有分摊额')
  }
})

check('日历跨月推演与仪表盘前瞻完全一致（不再差 241 / 947 元）', () => {
  const dash = proj.buildProjection({
    ...auditArgs, year: 2026, month: 11, months: 6
  })
  const nov = proj.buildMonthProjection({ ...auditArgs, year: 2026, month: 11 })
  const dec = proj.buildMonthProjection({ ...auditArgs, year: 2026, month: 12 })
  assert.equal(nov.projection.cf.monthEnd, dash.cf.monthEnd)
  assert.equal(nov.projection.cf.monthEnd, dash.forecast[0].endBalance)
  assert.equal(dec.startBalance, dash.forecast[0].endBalance)
  assert.equal(dec.projection.cf.monthEnd, dash.forecast[1].endBalance)
})

check('已录入同额月供时单月推演不重复扣款', () => {
  const nov = proj.buildMonthProjection({ ...auditArgs, year: 2026, month: 11 })
  assert.equal(nov.projection.cf.events.filter((e) => e.type === 'repay' && e.day === 15).length, 1)
  assert.equal(nov.projection.cf.monthEnd, -241.05)
})

check('真实基准：11/25 余额贴近 -47.05，11/1 不再显示整月开支一次性扣完', () => {
  const nov = proj.buildMonthProjection({ ...auditArgs, year: 2026, month: 11 })
  const b25 = nov.projection.cf.daily[24].balance
  assert.ok(Math.abs(b25 - (-47.05)) < 5, `11/25 实际 ${b25}`)
  assert.ok(nov.projection.cf.daily[0].balance > 0, '11/1 不应为 -714')
})

check('按日均摊的日常零花不进入逐笔对账清单', () => {
  const events = [
    { day: 1, type: 'expense', label: '餐饮', amount: -39.30, spread: true },
    { day: 15, type: 'repay', label: '还款扣款', amount: -241 }
  ]
  const out = rec.findUnmatchedEvents(events, [], '2026-11', 1)
  assert.equal(out.length, 1)
  assert.equal(out[0].date, '2026-11-15')
})

check('日历页确实使用跨月滚动入口并传入每月固定还款', () => {
  const src = readFileSync('src/views/Calendar.vue', 'utf8')
  assert.match(src, /buildMonthProjection/)
  assert.match(src, /readRecurringRepayment\(\)/)
  assert.match(src, /classifyDay/)
})

// ============================================================
// 社保规则数据化：读表算钱必须严格等于 product_baseline.json
// ============================================================
console.log('\n【社保规则与金额严格性】')
const ins = await load('src/lib/insurance.js')

// 与 supabase/migrations/0001_init.sql 的武汉江汉区 10 行模板逐条一致
const wuhanRows = [
  { city: '武汉江汉区', item: '养老', party: 'personal', category: 'rate', rate: 0.08, amount: 0 },
  { city: '武汉江汉区', item: '职工基本医疗保险', party: 'personal', category: 'rate', rate: 0.02, amount: 0 },
  { city: '武汉江汉区', item: '大额医疗费用补助', party: 'personal', category: 'fixed', rate: 0, amount: 7 },
  { city: '武汉江汉区', item: '失业', party: 'personal', category: 'rate', rate: 0.003, amount: 0 },
  { city: '武汉江汉区', item: '公积金', party: 'personal', category: 'rate', rate: 0.08, amount: 0 },
  { city: '武汉江汉区', item: '养老', party: 'company', category: 'rate', rate: 0.16, amount: 0 },
  { city: '武汉江汉区', item: '医疗', party: 'company', category: 'rate', rate: 0.08, amount: 0 },
  { city: '武汉江汉区', item: '失业', party: 'company', category: 'rate', rate: 0.007, amount: 0 },
  { city: '武汉江汉区', item: '工伤', party: 'company', category: 'rate', rate: 0.006, amount: 0 },
  { city: '武汉江汉区', item: '公积金', party: 'company', category: 'rate', rate: 0.08, amount: 0 }
]

check('规则表解析：武汉模板 5 项个人 + 5 项公司，比例与固定额全部正确', () => {
  const r = ins.parseInsuranceRules(wuhanRows, '武汉江汉区')
  assert.equal(r.matched, 10)
  assert.equal(r.personal.pension, 0.08)
  assert.equal(r.personal.medical, 0.02)
  assert.equal(r.personal.unemployment, 0.003)
  assert.equal(r.personal.fund, 0.08)
  assert.equal(r.personal.bigMedicalFixed, 7)
  assert.equal(r.company.injury, 0.006)
})

check('读表计算：个人扣款 666.61、到手 4333.39，严格等于基准', () => {
  const r = ins.parseInsuranceRules(wuhanRows, '武汉江汉区')
  const s = engine.calcNetSalary(realApp.salaryConfig, {
    rates: r.personal, companyRates: r.company,
    taxThreshold: 5000, monthIndex: 5
  })
  assert.equal(s.insuranceTotal, 666.61)
  assert.equal(s.tax, 0)
  assert.equal(s.net, 4333.39)
  assert.deepEqual(s.breakdown, {
    pension: 364.16, medical: 89.96, unemployment: 13.49, fund: 192, bigMedical: 7
  })
})

check('公司用工附加成本 1338.64，五项分项与基准逐条一致', () => {
  const r = ins.parseInsuranceRules(wuhanRows, '武汉江汉区')
  const c = ins.computeCompanyCost(r.company, realApp.salaryConfig)
  assert.equal(c.total, 1338.64)
  assert.equal(c.breakdown.pension, 728.32)
  assert.equal(c.breakdown.medical, 359.84)
  assert.equal(c.breakdown.unemployment, 31.49)
  assert.equal(c.breakdown.injury, 26.99)
  assert.equal(c.breakdown.fund, 192)
})

check('比例确实来自规则表而非硬编码：改规则后金额随之改变', () => {
  const changed = wuhanRows.map((r) => (
    r.item === '养老' && r.party === 'personal' ? { ...r, rate: 0.10 } : r
  ))
  const r = ins.parseInsuranceRules(changed, '武汉江汉区')
  const s = engine.calcNetSalary(realApp.salaryConfig, { rates: r.personal })
  assert.equal(s.breakdown.pension, 455.2)
  assert.equal(s.insuranceTotal, 757.65)
})

check('规则表为空或城市不匹配时回落兜底，金额不漂移', () => {
  const empty = ins.parseInsuranceRules([], '武汉江汉区')
  assert.equal(empty.matched, 0)
  const a = engine.calcNetSalary(realApp.salaryConfig, { rates: empty.personal })
  const b = engine.calcNetSalary(realApp.salaryConfig)
  assert.equal(a.net, b.net)
  assert.equal(a.insuranceTotal, 666.61)
  assert.equal(ins.parseInsuranceRules(wuhanRows, '其他城市').matched, 0)
})

check('统一推演入口、档案页预览、直接计算三者口径一致', () => {
  const app2 = { ...realApp, insuranceRules: wuhanRows }
  const p = proj.buildProjection({
    app: app2, startBalance: 465, year: 2026, month: 11,
    recurringRepayment: 241, months: 1
  })
  assert.ok(p.rules.matched > 0)
  assert.equal(p.netNow.net, 4333.39)
  assert.equal(p.netNow.insuranceTotal, 666.61)
  assert.equal(p.companyCost, 1338.64)
  const r = ins.parseInsuranceRules(wuhanRows, null)
  const direct = engine.calcNetSalary(app2.salaryConfig, {
    rates: r.personal, companyRates: r.company, taxThreshold: 5000, monthIndex: 5
  })
  assert.equal(p.netNow.net, direct.net)
  assert.equal(p.netNow.companyTotal, direct.companyTotal)
})

check('风险扫描补齐 PRD 的还款冲突与长期分期负担两类', () => {
  const cf = engine.computeCashflow({
    startBalance: 465, year: 2026, month: 11, payDay: 15,
    scenarios: [{ label: 'x', net: 1000 }], mainLabel: 'x',
    expenses: [], repayments: [{ date: '2026-11-25', amount: 3619.44 }],
    liabilities: [{ type: 'installment', remaining_principal: 4097 }],
    recurringRepayment: 241
  })
  const kinds = cf.warnings.map((w) => w.kind)
  assert.ok(kinds.includes('repayConflict'), '缺少还款冲突')
  assert.ok(kinds.includes('longTermDebt'), '缺少长期分期负担')
})

check('金额打码默认关闭，格式化结果不漂移', () => {
  assert.equal(labels.formatMoney(4333.39), '4,333.39 元')
  assert.equal(labels.formatMoney(4333.39, false), '4,333.39')
})

check('所有页面共用统一推演入口，不各自组装口径', () => {
  for (const file of ['Dashboard.vue', 'Calendar.vue', 'Ledger.vue', 'AINote.vue', 'Settings.vue']) {
    const src = readFileSync(`src/views/${file}`, 'utf8')
    if (file === 'Settings.vue') {
      assert.match(src, /parseInsuranceRules/, `${file} 应读规则表`)
    } else {
      assert.match(src, /buildProjection|buildMonthProjection/, `${file} 应复用统一推演入口`)
    }
  }
})

check('RLS 静态校验：9 张用户表启用行级安全且策略限定本人', () => {
  const sql = readFileSync('../supabase/migrations/0001_init.sql', 'utf8')
  const tables = [
    'profiles', 'salary_config', 'expense_category', 'liability',
    'repayment_event', 'transaction', 'pending_income', 'todo', 'ai_interaction_log'
  ]
  for (const t of tables) {
    assert.match(
      sql, new RegExp(`alter table public\\.${t}\\s+enable row level security`),
      `${t} 未启用 RLS`
    )
    assert.match(
      sql, new RegExp(`on public\\.${t}\\s+for all using \\(auth\\.uid\\(\\)=user_id\\)`),
      `${t} 缺少 auth.uid()=user_id 策略`
    )
  }
  assert.match(sql, /on public\.insurance_rule\s+for select/)
  assert.match(sql, /on public\.holiday_calendar\s+for select/)
})

check('还款到期提醒覆盖逾期 / 当天 / 3 天内，且排除已还', () => {
  const src = readFileSync('src/views/Dashboard.vue', 'utf8')
  assert.match(src, /repayReminders/)
  assert.match(src, /status !== 'paid'/)
  assert.match(src, /days <= 3/)
  assert.match(src, /todayISO\(\)/)
})

// ============================================================
// 动效系统：只动 GPU 属性、尊重减弱动效、绝不产生「中间金额」
// ============================================================
console.log('\n【动效系统】')
const css = readFileSync('src/styles/theme.css', 'utf8')

check('动效 token 与关键帧齐备，关键帧内不动画任何布局属性', () => {
  for (const v of ['--dur-fast', '--dur-base', '--dur-slow', '--ease-out', '--ease-in-out']) {
    assert.ok(css.includes(v), `缺少 ${v}`)
  }
  const blocks = [...css.matchAll(/@keyframes\s+[\w-]+\s*\{([\s\S]*?)\n\}/g)].map((m) => m[1])
  assert.ok(blocks.length >= 6, `关键帧数量不足：${blocks.length}`)
  for (const b of blocks) {
    assert.doesNotMatch(
      b, /\b(width|height|top|left|right|bottom|margin|padding|background-position)\s*:/,
      '关键帧里出现了布局属性，会造成重排'
    )
  }
})

check('减弱动效：delay 与循环一并清零，交错动画不会残留等待', () => {
  const rm = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'))
  assert.ok(rm.length > 0)
  assert.match(rm, /animation-delay:\s*0ms\s*!important/)
  assert.match(rm, /transition-delay:\s*0ms\s*!important/)
  assert.match(rm, /animation-iteration-count:\s*1\s*!important/)
  assert.match(rm, /animation-duration:\s*\.01ms\s*!important/)
})

check('入场动画用 backwards，不锁死 transform（hover / active 仍生效）', () => {
  assert.doesNotMatch(css, /animation:\s*(?:rise-in|page-in)[^;]*\bboth\b/)
  const cal = readFileSync('src/views/Calendar.vue', 'utf8')
  assert.match(cal, /cal-cell-in 320ms var\(--ease-out\) backwards/)
  assert.match(cal, /--i/, '日历格子应支持交错入场')
})

check('登录↔主界面用 transition 且不加 :key，子路由切换不重建布局', () => {
  const app = readFileSync('src/App.vue', 'utf8')
  assert.match(app, /<transition name="auth-page" mode="out-in">/)
  assert.match(app, /<component :is="Component" \/>/)
  assert.doesNotMatch(app, /:key="route/)
})

check('骨架屏 shimmer 用 transform 位移，不动画 background-position', () => {
  const app = readFileSync('src/App.vue', 'utf8')
  // 只匹配真实声明（带冒号），注释里提到该属性名不算
  assert.doesNotMatch(app, /background-position\s*:/)
  assert.match(app, /@keyframes boot-sweep/)
})

check('图表动效只作用于绘制过程，数值与数据点不变', () => {
  const t = readFileSync('src/components/CashflowTimeline.vue', 'utf8')
  assert.match(t, /animationDuration:\s*520/)
  assert.match(t, /animationEasing:\s*'cubicOut'/)
  assert.match(t, /animationDelay:\s*\(idx\)/)
})

check('金额不做数字滚动：不存在逐帧计数 / 定时器驱动的数字动画', () => {
  const views = ['Dashboard.vue', 'Ledger.vue', 'Calendar.vue', 'Settings.vue']
    .map((f) => readFileSync(`src/views/${f}`, 'utf8')).join('\n')
  assert.doesNotMatch(views, /requestAnimationFrame|countUp|setInterval|setTimeout\(.*formatMoney/)
})

console.log('\n【安全与隔离回归】')
const prefsMod = await load('src/lib/prefs.js')

function withFakeStorage(fn) {
  const prev = globalThis.localStorage
  const store = {
    getItem(k) { return Object.prototype.hasOwnProperty.call(this, k) ? this[k] : null },
    setItem(k, v) { this[k] = String(v) },
    removeItem(k) { delete this[k] }
  }
  globalThis.localStorage = store
  try {
    return fn(store)
  } finally {
    if (prev === undefined) delete globalThis.localStorage
    else globalThis.localStorage = prev
  }
}

check('偏好按账号隔离：切换账号读不到上一个人的期初余额与历史薪资', () => {
  withFakeStorage(() => {
    prefsMod.setPrefScope('user-a')
    prefsMod.writePref('startBalance', 465)
    prefsMod.writePref('salaryYtd', [{ month: 8, preTax: 4000 }])
    assert.equal(prefsMod.readPref('startBalance', 0), 465)
    prefsMod.setPrefScope('user-b')
    assert.equal(prefsMod.readPref('startBalance', 0), 0)
    assert.deepEqual(prefsMod.readPref('salaryYtd', []), [])
    prefsMod.setPrefScope('user-a')
    assert.equal(prefsMod.readPref('startBalance', 0), 465)
    prefsMod.clearPrefs()
    assert.equal(prefsMod.readPref('startBalance', 0), 0)
  })
})

check('旧版全局偏好 key 一次性迁移到当前账号且不再共享', () => {
  withFakeStorage((store) => {
    store.setItem('paytrace:pref:cushionTarget', '2000')
    prefsMod.setPrefScope('user-c')
    assert.equal(prefsMod.readPref('cushionTarget', 0), 2000)
    assert.equal(store.getItem('paytrace:pref:cushionTarget'), null)
    assert.equal(store.getItem('paytrace:pref:user-c:cushionTarget'), '2000')
  })
})

check('档案加载按账号隔离：inflight 绑定 uid，响应写入前复核', () => {
  const src = readFileSync('src/stores/app.js', 'utf8')
  assert.match(src, /inflight = \{ uid, promise \}/)
  assert.match(src, /inflight\.uid === uid/)
  assert.match(src, /useAuthStore\(\)\.userId !== uid\) return/)
  assert.match(src, /this\._persist\(uid\)/)
  const auth = readFileSync('src/stores/auth.js', 'utf8')
  assert.match(auth, /setPrefScope\(/)
  assert.match(auth, /clearPrefs\(\)/)
})

check('tooltip 动态片段统一 HTML 转义', () => {
  const s = labels.escapeHtml('<img src=x onerror="alert(1)">&"\'')
  assert.ok(!s.includes('<img'))
  assert.match(s, /&lt;img/)
  assert.match(s, /&amp;/)
  assert.match(s, /&quot;/)
  assert.match(s, /&#39;/)
  assert.equal(labels.escapeHtml(null), '')
  const t = readFileSync('src/components/CashflowTimeline.vue', 'utf8')
  assert.match(t, /escapeHtml\(e\.label\)/)
  assert.match(t, /escapeHtml\(s\.seriesName\)/)
  assert.doesNotMatch(t, /\$\{e\.label\}/)
})

check('agnes-proxy：CORS 预检、输入限长、错误脱敏、超时与版本锁定', () => {
  const fn = readFileSync('../supabase/functions/agnes-proxy/index.ts', 'utf8')
  assert.match(fn, /req\.method === "OPTIONS"/)
  assert.match(fn, /Access-Control-Allow-Origin/)
  assert.match(fn, /AbortSignal\.timeout/)
  assert.match(fn, /slice\(0, MAX_TEXT\)/)
  assert.match(fn, /@supabase\/supabase-js@2\.43\.4/)
  assert.doesNotMatch(fn, /detail: String\(e\)/)
  assert.doesNotMatch(fn, /status: upstream\.status/)
})

check('打码状态走内存缓存，formatMoney 热路径不再同步读 localStorage', () => {
  const privacy = readFileSync('src/lib/privacy.js', 'utf8')
  assert.match(privacy, /let cache = null/)
  assert.doesNotMatch(privacy, /localStorage\.getItem/)
  const prev = globalThis.localStorage
  let reads = 0
  globalThis.localStorage = {
    getItem(k) {
      reads++
      return Object.prototype.hasOwnProperty.call(this, k) ? this[k] : null
    },
    setItem(k, v) { this[k] = String(v) },
    removeItem(k) { delete this[k] }
  }
  try {
    labels.formatMoney(1)
    const before = reads
    for (let i = 0; i < 50; i++) labels.formatMoney(i)
    assert.equal(reads, before)
  } finally {
    if (prev === undefined) delete globalThis.localStorage
    else globalThis.localStorage = prev
  }
})

check('偏好写入防抖、卸载取消定时器、图表不再全量重绘', () => {
  const dash = readFileSync('src/views/Dashboard.vue', 'utf8')
  assert.match(dash, /debounced\(/)
  assert.match(dash, /writers\.forEach\(\(w\) => w\.cancel\(\)\)/)
  const t = readFileSync('src/components/CashflowTimeline.vue', 'utf8')
  assert.match(t, /replaceMerge/)
  assert.doesNotMatch(t, /deep:\s*true/)
})

check('日历切月有上界、账本切月丢弃过期响应', () => {
  const cal = readFileSync('src/views/Calendar.vue', 'utf8')
  assert.match(cal, /MAX_MONTH_OFFSET = 24/)
  assert.match(cal, /monthOffset\(\) <= -MAX_MONTH_OFFSET/)
  assert.match(cal, /monthOffset\(\) >= MAX_MONTH_OFFSET/)
  const ledger = readFileSync('src/views/Ledger.vue', 'utf8')
  assert.match(ledger, /if \(seq !== loadSeq\) return/)
})

check('会话不解析 URL、登录跳转只接受站内路径', () => {
  const sb = readFileSync('src/lib/supabase.js', 'utf8')
  assert.match(sb, /detectSessionInUrl: false/)
  const login = readFileSync('src/views/Login.vue', 'utf8')
  assert.ok(login.includes("!raw.startsWith('//')"))
})

console.log('\n【智能分类】')

check('关键词规则覆盖更细的生活场景', () => {
  assert.equal(aid.inferCategory('昨天中午快餐45'), '餐饮')
  assert.equal(aid.inferCategory('打车23'), '打车')
  assert.equal(aid.inferCategory('话费充值100'), '话费')
  assert.equal(aid.inferCategory('晚上买水3块'), '饮品')
  assert.equal(aid.inferCategory('买药38'), '药品')
  assert.equal(aid.inferCategory('电影票45'), '娱乐')
  assert.equal(aid.inferCategory('淘宝买鞋299'), '服饰')
  assert.equal(aid.inferCategory('交房租1500'), '房租')
  assert.equal(aid.inferCategory('孩子学费2000'), '教育')
  assert.equal(aid.inferCategory('视频会员续费25'), '订阅')
  assert.equal(aid.inferCategory('朋友结婚随礼500'), '人情')
  assert.equal(aid.inferCategory('不知道花了啥'), '')
  assert.equal(aid.inferCategory(''), '')
  assert.ok(aid.CATEGORY_OPTIONS.length >= 20, '默认分类不应再局限 8 类')
})

check('分类归一化：清单直用、模型别名归一、用户手填保留、空值兜底', () => {
  assert.equal(aid.normalizeCategory('餐饮', ''), '餐饮')
  assert.equal(aid.normalizeCategory('午饭', ''), '午饭', '用户手填的分类不被规则改写')
  assert.equal(aid.normalizeCategory('午饭', '', { fromModel: true }), '午餐')
  assert.equal(aid.normalizeCategory('交通费', '', { fromModel: true }), '通勤')
  assert.equal(aid.normalizeCategory('', '中午吃了快餐'), '餐饮')
  assert.equal(aid.normalizeCategory('', '不知道'), '其他')
  assert.equal(aid.normalizeCategory('孩子学费', '', { categories: ['孩子学费'] }), '孩子学费')
})

check('AI 草稿自动归一分类，且一句话多笔按各自备注判类', () => {
  const res = { result: [
    { date: '2026-11-05', direction: '支出', category: '午饭', amount: 45, note: '中午快餐' },
    { date: '2026-11-05', direction: '支出', category: '', amount: 23, note: '打车回家' }
  ] }
  const items = aid.normalizeAiResult(res, '昨天中午快餐45，打车23')
  assert.equal(items.length, 2)
  assert.equal(items[0].category, '午餐')
  assert.equal(items[1].category, '打车')
  assert.equal(items[0].originalCategory, '午饭')
  assert.ok(aid.validateDraft(items[0]).ok)
})

check('手动记账与草稿留空分类自动兜底，不会被校验层卡住', () => {
  const blank = aid.makeBlankDraft()
  blank.amount = 45
  blank.note = '午饭'
  assert.equal(aid.validateDraft(blank).value.category, '午餐')
  const ledger = readFileSync('src/views/Ledger.vue', 'utf8')
  assert.match(ledger, /normalizeCategory\(form\.category, form\.note, habitOptions\(\)\)/)
  assert.match(ledger, /inferCategory\(v, habitOptions\(\)\)/)
  assert.match(ledger, /learnFromRows\(/)
  const ai = readFileSync('src/views/AINote.vue', 'utf8')
  assert.match(ai, /normalizeAiResult\(res, noteText\.value, habitOptions\(\)\)/)
  assert.match(ai, /categories: habitCategories\(\)/)
  assert.match(ai, /recordAlias\(/)
})

console.log('\n【分类习惯】')
const hab = await load('src/lib/categoryHabits.js')

check('记住用过的分类：计数、自定义收录、按频次排在前面', () => {
  withFakeStorage(() => {
    hab.clearHabits()
    hab.recordUsage('工作餐')
    hab.recordUsage('工作餐')
    hab.recordUsage('打车')
    hab.learnFromRows([{ category: '孩子学费' }, { category: '孩子学费' }])
    const h = hab.getHabits()
    assert.ok(Number(h.counts['工作餐']) >= 2)
    assert.ok(h.custom.includes('工作餐'))
    assert.ok(h.custom.includes('孩子学费'))
    const cats = hab.habitCategories()
    assert.equal(cats[0], '工作餐', '用得最多的分类应排最前')
    assert.ok(cats.includes('孩子学费'))
    assert.ok(cats.includes('餐饮'), '默认清单仍应补齐')
    hab.clearHabits()
  })
})

check('记住改过的说法：别名优先于默认规则', () => {
  withFakeStorage(() => {
    hab.clearHabits()
    hab.recordAlias('午饭', '工作餐')
    assert.equal(hab.habitOptions().aliases['午饭'], '工作餐')
    const opts = hab.habitOptions()
    assert.equal(aid.inferCategory('午饭45', opts), '工作餐')
    assert.equal(aid.normalizeCategory('', '午饭', opts), '工作餐')
    const items = aid.normalizeAiResult(
      { result: [{ date: '2026-11-05', direction: '支出', category: '午饭', amount: 45, note: '午饭' }] },
      '', opts
    )
    assert.equal(items[0].category, '工作餐')
    assert.equal(items[0].originalCategory, '午饭')
    hab.clearHabits()
  })
})

check('习惯按账号隔离且退出不清（key 带 uid，独立于 prefs 命名空间）', () => {
  const src = readFileSync('src/lib/categoryHabits.js', 'utf8')
  assert.match(src, /getPrefScope\(\)/)
  assert.match(src, /paytrace:habits:/)
  assert.doesNotMatch(src, /readPref\(|writePref\(/)
  assert.match(src, /退出登录不清除/)
})

check('Edge Function 不再写死枚举，改为接收并清洗常用分类清单', () => {
  const fn = readFileSync('../supabase/functions/agnes-proxy/index.ts', 'utf8')
  assert.ok(!fn.includes('category":"餐饮|话费|通勤'))
  assert.ok(fn.includes('用户常用分类'))
  assert.ok(fn.includes('body.categories'))
  assert.ok(fn.includes('slice(0, 40)'))
  assert.ok(fn.includes('.replace(/['))
})

check('用户自己填的分类不被备注里的关键词覆盖', () => {
  assert.equal(aid.normalizeCategory('工作餐', '午饭', {}), '工作餐')
  assert.equal(aid.normalizeCategory('孩子学费', '午饭时交的学费', {}), '孩子学费')
  // 用户手填保留；模型给的值才归一；分类为空才用备注推断
  assert.equal(aid.normalizeCategory('午饭', '', {}), '午饭')
  assert.equal(aid.normalizeCategory('午饭', '', { fromModel: true }), '午餐')
  assert.equal(aid.normalizeCategory('', '打车回家', {}), '打车')
  const draft = aid.makeBlankDraft()
  draft.amount = 45
  draft.note = '午饭'
  draft.category = '工作餐'
  assert.equal(aid.validateDraft(draft).value.category, '工作餐')
})

check('习惯学习链路：改过的分类能保留并正确记为别名', () => {
  withFakeStorage(() => {
    hab.clearHabits()
    hab.recordAlias('午饭', '工作餐')
    const opts = hab.habitOptions()
    const items = aid.normalizeAiResult(
      { result: [{ date: '2026-11-05', direction: '支出', category: '午饭', amount: 45, note: '午饭' }] },
      '', opts
    )
    items[0].category = '工作餐'
    assert.equal(aid.validateDraft(items[0], opts).value.category, '工作餐')
    assert.equal(items[0].originalCategory, '午饭')
    hab.clearHabits()
  })
})

console.log('\n【AI 日期兜底】')

check('模型返回离谱历史日期时回退到今天并标记', () => {
  const items = aid.normalizeAiResult({
    result: [{ date: '2023-10-06', direction: '支出', category: '餐饮', amount: 45 }]
  })
  assert.equal(items[0].txn_date, date.todayISO())
  assert.equal(items[0].dateAdjusted, true)
})

check('近期合法日期保留，非法日期回退', () => {
  const t = date.todayISO()
  const ok = aid.normalizeAiResult({ result: [{ date: t, amount: 10 }] })
  assert.equal(ok[0].txn_date, t)
  assert.equal(ok[0].dateAdjusted, false)
  const bad = aid.normalizeAiResult({ result: [{ date: '2026-02-30', amount: 10 }] })
  assert.equal(bad[0].txn_date, t)
  assert.equal(bad[0].dateAdjusted, true)
})

check('Edge Function 注入今天日期并强调逐笔不遗漏', () => {
  const fn = readFileSync('../supabase/functions/agnes-proxy/index.ts', 'utf8')
  assert.ok(fn.includes('今天日期（北京时间）'))
  assert.ok(fn.includes('Asia/Shanghai'))
  assert.ok(fn.includes('不要遗漏'))
})

check('日历当前月不再显示「历史月份」文案', () => {
  const cal = readFileSync('src/views/Calendar.vue', 'utf8')
  assert.match(cal, /isCurrentMonth \? '本月按档案推演/)
})

console.log('\n【看得懂的现金流】')

check('每日事件带逐笔明细：金额合计等于当天支出，均摊项单独标记', () => {
  const e = engine.computeCashflow({
    startBalance: 1000, year: 2026, month: 11, payDay: 15,
    scenarios: [{ label: '当前薪资', net: 4000 }], mainLabel: '当前薪资',
    expenses: [
      { day: 1, name: '房租', amount: 300, spread: false },
      { day: 1, name: '话费', amount: 60, spread: false },
      { day: 5, name: '餐饮', amount: 310, spread: true }
    ],
    repayments: [{ date: '2026-11-20', name: '白条', amount: 200 }]
  })
  const d1 = e.events.filter((x) => x.day === 1 && x.type === 'expense')[0]
  const fixed = d1.items.filter((i) => !i.spread)
  assert.deepEqual(fixed.map((i) => i.name), ['房租', '话费'])
  assert.equal(fixed.reduce((s, i) => s + i.amount, 0), 360)
  // 逐笔合计必须等于当天支出合计（含「餐饮」均摊到 1 号的那一份）
  assert.ok(Math.abs(d1.items.reduce((s, i) => s + i.amount, 0) + d1.amount) < 0.001)
  assert.equal(d1.items.filter((i) => i.spread).length, 1)
  // 按日均摊：每天都有一笔带 spread 标记，单日金额接近月额 / 天数
  const d5 = e.events.filter((x) => x.day === 5 && x.type === 'expense')[0]
  assert.equal(d5.items[0].spread, true)
  assert.ok(Math.abs(d5.items[0].amount - 310 / 30) < 0.01)
  // 还款同样逐笔，不再只给一个「还款扣款」合计
  const rp = e.events.filter((x) => x.day === 20 && x.type === 'repay')[0]
  assert.equal(rp.items[0].name, '白条')
  assert.equal(rp.items[0].amount, 200)
})

check('当前真实余额：可写入、带更新日期、按账号隔离且退出清理', () => {
  withFakeStorage(() => {
    prefsMod.setPrefScope('user-a')
    assert.equal(prefsMod.readCurrentBalance().value, null)
    prefsMod.writeCurrentBalance(1234.56)
    const a = prefsMod.readCurrentBalance()
    assert.equal(a.value, 1234.56)
    assert.match(a.updatedAt, /^\d{4}-\d{2}-\d{2}$/)
    prefsMod.setPrefScope('user-b')
    assert.equal(prefsMod.readCurrentBalance().value, null)
    prefsMod.setPrefScope('user-a')
    assert.equal(prefsMod.readCurrentBalance().value, 1234.56)
    prefsMod.clearPrefs()
    assert.equal(prefsMod.readCurrentBalance().value, null)
  })
})

check('首页展示「现在还剩多少」且与推演值分开，支持一键设为期初', () => {
  const dash = readFileSync('src/views/Dashboard.vue', 'utf8')
  assert.match(dash, /readCurrentBalance/)
  assert.match(dash, /writeCurrentBalance/)
  assert.match(dash, /现在还剩/)
  assert.match(dash, /真实余额/)
  assert.match(dash, /设为推演期初/)
  assert.match(dash, /syncToStart/)
  assert.match(dash, /推演值/)
  assert.match(dash, /Mascot/)
})

check('现金流日历：标清「余额 / 今日净变化」，逐笔列出每笔金额与等式', () => {
  const cal = readFileSync('src/views/Calendar.vue', 'utf8')
  assert.match(cal, /当天结束时的预计余额/)
  assert.match(cal, /cal-balance-label/)
  assert.match(cal, /cal-delta/)
  assert.match(cal, /selectedItems/)
  assert.match(cal, /e\.items/)
  assert.match(cal, /dd-equation/)
  assert.match(cal, /具体是哪几笔/)
  // 不再把多个开支名拼成一行直接展示给用户
  assert.doesNotMatch(cal, /\{\{ e\.label \}\}/)
})

check('状态伙伴为纯 SVG 图形，按余额状态切换表情且不使用 emoji', () => {
  const m = readFileSync('src/components/Mascot.vue', 'utf8')
  assert.match(m, /<svg/)
  assert.match(m, /level === 'neg'/)
  assert.match(m, /level === 'ok'/)
  assert.doesNotMatch(m, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u)
})

check('宽屏阅读宽度收敛，趣味卡片使用圆角 token', () => {
  const t = readFileSync('src/styles/theme.css', 'utf8')
  assert.match(t, /--radius-lg/)
  assert.match(t, /main\.content > \* \{ max-width: 1240px/)
})

console.log('\n【余额变动台账】')

check('首次写入建立基线：不编造旧值，台账与余额一次写入且一致', () => {
  withFakeStorage(() => {
    prefsMod.setPrefScope('user-t')
    const rec = prefsMod.writeCurrentBalance(72, { reason: '用户口述当前余额' })
    assert.equal(rec.kind, 'baseline')
    assert.equal(rec.from, null)
    assert.equal(rec.delta, null)
    assert.equal(rec.to, 72)
    assert.match(rec.at, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
    assert.equal(rec.date, date.todayISO())
    assert.equal(rec.reason, '用户口述当前余额')
    const cur = prefsMod.readCurrentBalance()
    assert.equal(cur.value, 72)
    assert.equal(cur.log.length, 1)
    const v = prefsMod.verifyBalanceLog()
    assert.equal(v.count, 1)
    assert.equal(v.consistent, true)
    assert.equal(v.chainOk, true)
  })
})

check('连续变动：差额按「分」精确计算，链条前后衔接', () => {
  withFakeStorage(() => {
    prefsMod.setPrefScope('user-t')
    prefsMod.writeCurrentBalance(0.1, { reason: '起始' })
    const r2 = prefsMod.writeCurrentBalance(0.3, { reason: '存入' })
    assert.equal(r2.kind, 'update')
    assert.equal(r2.from, 0.1)
    assert.equal(r2.to, 0.3)
    assert.equal(r2.delta, 0.2)            // 0.3 - 0.1 必须精确等于 0.2
    const r3 = prefsMod.writeCurrentBalance(-15.25, { reason: '透支' })
    assert.equal(r3.delta, -15.55)         // -15.25 - 0.3
    const v = prefsMod.verifyBalanceLog()
    assert.equal(v.count, 3)
    assert.equal(v.chainOk, true)
    assert.equal(v.consistent, true)
    assert.equal(v.latest, -15.25)
    assert.equal(prefsMod.readCurrentBalance().value, -15.25)
  })
})

check('台账 append-only：旧记录不被改写，非法金额拒绝写入', () => {
  withFakeStorage(() => {
    prefsMod.setPrefScope('user-t')
    prefsMod.writeCurrentBalance(100, { reason: 'A' })
    const before = JSON.stringify(prefsMod.readBalanceLog())
    prefsMod.writeCurrentBalance(NaN)
    assert.equal(JSON.stringify(prefsMod.readBalanceLog()), before)
    assert.equal(prefsMod.readCurrentBalance().value, 100)
    prefsMod.writeCurrentBalance(80, { reason: 'B' })
    const log = prefsMod.readBalanceLog()
    assert.equal(log.length, 2)
    assert.equal(log[0].reason, 'A')
    assert.equal(log[1].reason, 'B')
  })
})

check('台账按账号隔离，退出清理后不带到下一位', () => {
  withFakeStorage(() => {
    prefsMod.setPrefScope('user-t')
    prefsMod.writeCurrentBalance(72, { reason: '甲' })
    prefsMod.setPrefScope('user-u')
    assert.deepEqual(prefsMod.readBalanceLog(), [])
    assert.equal(prefsMod.readCurrentBalance().value, null)
    prefsMod.setPrefScope('user-t')
    assert.equal(prefsMod.readBalanceLog().length, 1)
    prefsMod.clearPrefs()
    assert.deepEqual(prefsMod.readBalanceLog(), [])
  })
})

check('首页接入：变更备注、台账展示、无变动不记假账', () => {
  const dash = readFileSync('src/views/Dashboard.vue', 'utf8')
  assert.match(dash, /balanceReason/)
  assert.match(dash, /writeCurrentBalance\(next, /)
  assert.match(dash, /reason: balanceReason\.value/)
  assert.match(dash, /readBalanceLog/)
  assert.match(dash, /verifyBalanceLog/)
  assert.match(dash, /余额变动记录/)
  assert.match(dash, /核对一致/)
  assert.match(dash, /没有产生变动，未记新账/)
})

console.log(`\n结果：通过 ${passed} 项，失败 ${failed} 项\n`)
if (failed > 0) process.exitCode = 1
