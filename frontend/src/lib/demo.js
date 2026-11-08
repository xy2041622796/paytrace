// ============================================================
// 本地演示模式（Demo Backend）
// ------------------------------------------------------------
// 触发条件：未配置 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY。
// 目的：零配置即可完整预览所有页面、真实数据与增删改查，方便验收与走查。
//
// 边界（务必延续）：
//  1. 只实现本项目实际用到的 Supabase JS 接口子集，不伪造完整 SDK。
//  2. 数据全部保存在浏览器 localStorage，绝不发起任何外部网络请求。
//  3. 一旦配置了真实 .env，createClient 走原生 Supabase，本文件完全不参与。
//  4. 演示账号与 RLS、Edge Function、agnes 密钥无任何关系，纯前端模拟。
// ============================================================

export const DEMO_USER_ID = '3a4c9ead-24ff-468c-b259-e0a5e28ba2c9'
export const DEMO_USERNAME = 'xy'

const DB_KEY = 'paytrace:demo-db:v2'
const SESSION_KEY = 'paytrace:demo-session'
// 演示数据版本标记：版本变化时清空旧的演示 / 偏好残留，保证跨会话数据一致
const INIT_MARKER_KEY = 'paytrace:demo-init:v2'

const uid = () => DEMO_USER_ID
const nowISO = () => new Date().toISOString()
const localISO = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

function safeStorage() {
  try { return typeof localStorage === 'undefined' ? null : localStorage } catch { return null }
}

// ------------------------------------------------------------
// 演示种子：严格对齐 supabase/0002_real_data_seed.sql 与 product_baseline.json
// ------------------------------------------------------------
function seedDatabase() {
  return {
    _seq: 100,
    profiles: [{
      id: 1, user_id: uid(), city: '武汉江汉区', hire_date: '2026-07-13',
      pay_day: 15, tax_threshold: 5000, work_schedule: 'double',
      created_at: '2026-07-01T00:00:00.000Z'
    }],
    salary_config: [
      {
        id: 2, user_id: uid(), phase: 'regular', pre_tax_salary: 5000,
        sb_base_pension: 4552, sb_base_medical: 4498, sb_base_unemploy: 4498,
        sb_base_fund: 2400, created_at: '2026-11-01T02:00:00.000Z'
      },
      {
        id: 1, user_id: uid(), phase: 'probation', pre_tax_salary: 4000,
        sb_base_pension: 4498, sb_base_medical: 4498, sb_base_unemploy: 4498,
        sb_base_fund: 2400, created_at: '2026-07-01T02:00:00.000Z'
      }
    ],
    expense_category: [
      { id: 1, user_id: uid(), name: '餐饮', monthly_amount: 1048, deduct_day: 1, created_at: '2026-07-01T02:00:00.000Z' },
      { id: 2, user_id: uid(), name: '零食机动', monthly_amount: 50, deduct_day: 1, created_at: '2026-07-01T02:00:00.000Z' },
      { id: 3, user_id: uid(), name: '话费', monthly_amount: 65, deduct_day: 1, created_at: '2026-07-01T02:00:00.000Z' },
      { id: 4, user_id: uid(), name: '共享单车月卡', monthly_amount: 16, deduct_day: 1, created_at: '2026-07-01T02:00:00.000Z' }
    ],
    repayment_event: [
      { id: 1, user_id: uid(), due_date: '2026-11-15', amount: 241.00, status: 'pending', created_at: '2026-10-31T02:00:00.000Z' },
      { id: 2, user_id: uid(), due_date: '2026-11-25', amount: 3619.44, status: 'pending', created_at: '2026-10-31T02:00:00.000Z' }
    ],
    liability: [
      { id: 1, user_id: uid(), type: 'white_bar', total: 5823.96, paid: 2223.96, remaining_principal: 3600, fee: 19.44, next_repay_date: '2026-11-25', status: 'deferred', created_at: '2026-10-31T02:00:00.000Z' },
      { id: 2, user_id: uid(), type: 'installment', total: 5784.00, paid: 1687.00, remaining_principal: 4097, fee: 0, next_repay_date: '2026-11-15', status: 'normal', created_at: '2026-10-31T02:00:00.000Z' },
      { id: 3, user_id: uid(), type: 'monthly_fixed', total: 81.00, paid: 0, remaining_principal: 81, fee: 0, next_repay_date: '2026-11-01', status: 'normal', created_at: '2026-10-31T02:00:00.000Z' }
    ],
    insurance_rule: [
      { id: 1, city: '武汉江汉区', item: '养老', party: 'personal', category: 'rate', rate: 0.08, amount: 0, is_active: true },
      { id: 2, city: '武汉江汉区', item: '职工基本医疗保险', party: 'personal', category: 'rate', rate: 0.02, amount: 0, is_active: true },
      { id: 3, city: '武汉江汉区', item: '大额医疗费用补助', party: 'personal', category: 'fixed', rate: 0, amount: 7, is_active: true },
      { id: 4, city: '武汉江汉区', item: '失业', party: 'personal', category: 'rate', rate: 0.003, amount: 0, is_active: true },
      { id: 5, city: '武汉江汉区', item: '公积金', party: 'personal', category: 'rate', rate: 0.08, amount: 0, is_active: true },
      { id: 6, city: '武汉江汉区', item: '养老', party: 'company', category: 'rate', rate: 0.16, amount: 0, is_active: true },
      { id: 7, city: '武汉江汉区', item: '医疗', party: 'company', category: 'rate', rate: 0.08, amount: 0, is_active: true },
      { id: 8, city: '武汉江汉区', item: '失业', party: 'company', category: 'rate', rate: 0.007, amount: 0, is_active: true },
      { id: 9, city: '武汉江汉区', item: '工伤', party: 'company', category: 'rate', rate: 0.006, amount: 0, is_active: true },
      { id: 10, city: '武汉江汉区', item: '公积金', party: 'company', category: 'rate', rate: 0.08, amount: 0, is_active: true }
    ],
    transaction: [
      { id: 1, user_id: uid(), txn_date: '2026-10-15', direction: 'income', category: '工资', amount: 4333.39, note: '10 月工资到账', source: 'manual', created_at: '2026-10-15T03:00:00.000Z' },
      { id: 2, user_id: uid(), txn_date: '2026-10-16', direction: 'expense', category: '餐饮', amount: 45, note: '同事聚餐', source: 'manual', created_at: '2026-10-16T03:00:00.000Z' },
      { id: 3, user_id: uid(), txn_date: '2026-11-01', direction: 'expense', category: '话费', amount: 100, note: '话费充值', source: 'manual', created_at: '2026-11-01T03:00:00.000Z' },
      { id: 4, user_id: uid(), txn_date: '2026-11-02', direction: 'expense', category: '餐饮', amount: 32, note: '午饭', source: 'ai', created_at: '2026-11-02T03:00:00.000Z' },
      { id: 5, user_id: uid(), txn_date: '2026-11-03', direction: 'income', category: '报销', amount: 120, note: '通勤费报销到账', source: 'manual', created_at: '2026-11-03T03:00:00.000Z' },
      { id: 6, user_id: uid(), txn_date: '2026-11-03', direction: 'expense', category: '通勤', amount: 6, note: '地铁', source: 'manual', created_at: '2026-11-03T03:00:00.000Z' },
      { id: 7, user_id: uid(), txn_date: '2026-11-04', direction: 'expense', category: '饮品', amount: 18.5, note: '下午茶', source: 'ai', created_at: '2026-11-04T03:00:00.000Z' },
      { id: 8, user_id: uid(), txn_date: '2026-11-05', direction: 'expense', category: '午餐', amount: 45, note: '中午快餐', source: 'ai', created_at: '2026-11-05T03:00:00.000Z' },
      { id: 9, user_id: uid(), txn_date: '2026-11-06', direction: 'expense', category: '打车', amount: 23, note: '加班打车回家', source: 'ai', created_at: '2026-11-06T03:00:00.000Z' },
      { id: 10, user_id: uid(), txn_date: '2026-11-07', direction: 'expense', category: '早餐', amount: 12, note: '豆浆油条', source: 'manual', created_at: '2026-11-07T03:00:00.000Z' }
    ],
    pending_income: [
      { id: 1, user_id: uid(), type: '学校奖项奖金', est_amount: 2000, status: 'unreceived', condition: '10 月中旬申报；到账后按实数修改并计入现金', created_at: '2026-10-20T03:00:00.000Z' },
      { id: 2, user_id: uid(), type: '应届生社保补贴（小微企业吸纳）', est_amount: null, status: 'reviewing', condition: '金额待确认（江汉区人社局）', created_at: '2026-10-22T03:00:00.000Z' },
      { id: 3, user_id: uid(), type: '武汉人社补贴 7-9 月', est_amount: 352.72, status: 'reviewing', condition: '基数 470.29 × 25% × 3；最长可领 12 个月', created_at: '2026-10-25T03:00:00.000Z' }
    ],
    todo: [
      { id: 1, user_id: uid(), title: '确认 11.25 白条 3619.44 的资金是否到位', related_repay_date: '2026-11-25', status: 'open', created_at: '2026-10-31T03:00:00.000Z' },
      { id: 2, user_id: uid(), title: '共享单车月卡 11.16 到期需重购', related_repay_date: '2026-11-16', status: 'open', created_at: '2026-10-31T03:00:00.000Z' },
      { id: 3, user_id: uid(), title: '转正薪资沟通：基准 5000 / 申请 6000 / 折中 5500 待 HR', related_repay_date: null, status: 'open', created_at: '2026-10-31T03:00:00.000Z' },
      { id: 4, user_id: uid(), title: '应届生社保补贴申报（江汉区人社局）', related_repay_date: null, status: 'open', created_at: '2026-10-31T03:00:00.000Z' }
    ],
    ai_interaction_log: [
      { id: 1, user_id: uid(), action: 'parse_note', confidence: 0.92, accepted: true, created_at: '2026-11-05T04:12:00.000Z' },
      { id: 2, user_id: uid(), action: 'parse_note', confidence: 0.61, accepted: false, created_at: '2026-11-06T05:30:00.000Z' },
      { id: 3, user_id: uid(), action: 'advise_purchase', confidence: 0.88, accepted: null, created_at: '2026-11-06T09:10:00.000Z' }
    ]
  }
}

function readDb() {
  const s = safeStorage()
  if (!s) return seedDatabase()
  try {
    const raw = s.getItem(DB_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object' && parsed.transaction) return parsed
    }
  } catch { /* 损坏则重建 */ }
  const seed = seedDatabase()
  writeDb(seed)
  return seed
}

function writeDb(db) {
  const s = safeStorage()
  if (!s) return
  try { s.setItem(DB_KEY, JSON.stringify(db)) } catch { /* 配额不足：仅本次会话生效 */ }
}

function seedPreferences() {
  const s = safeStorage()
  if (!s) return
  let fresh = false
  try {
    if (s.getItem(INIT_MARKER_KEY) !== '1') {
      // 只清理本产品的命名空间，绝不碰浏览器里其它站点 / 其它应用的数据
      Object.keys(s).filter((k) => k.startsWith('paytrace:')).forEach((k) => s.removeItem(k))
      s.setItem(INIT_MARKER_KEY, '1')
      fresh = true
    }
  } catch { /* 隐私模式：跳过清理 */ }
  const key = (name) => `paytrace:pref:${DEMO_USER_ID}:${name}`
  const put = (name, value) => {
    try { if (fresh || s.getItem(key(name)) == null) s.setItem(key(name), JSON.stringify(value)) } catch { /* noop */ }
  }
  put('startBalance', 465)
  put('recurringRepayment', 241)
  put('cushionTarget', 2000)
  put('reconcileTolerance', 1)
  put('salaryYtd', [
    { month: 7, preTax: 0, insuranceTotal: 0 },
    { month: 8, preTax: 4000, insuranceTotal: 716.29 },
    { month: 9, preTax: 4000, insuranceTotal: 720.61 },
    { month: 10, preTax: 4000, insuranceTotal: 720.61 }
  ])
  put('currentBalance', {
    value: 465,
    updatedAt: localISO(),
    log: [{
      id: 'demo-baseline', at: '2026-10-31 21:00:00', date: '2026-10-31',
      from: null, to: 465, delta: null, reason: '10 月末实际结余', kind: 'baseline'
    }]
  })
  try { if (s.getItem('paytrace:pref-scope') == null) s.setItem('paytrace:pref-scope', DEMO_USER_ID) } catch { /* noop */ }
}

// ------------------------------------------------------------
// Auth 模拟：自动登录，便于直接走查任意页面；登录 / 注册 / 退出仍可用
// ------------------------------------------------------------
const DEMO_USER = {
  id: DEMO_USER_ID,
  email: `${DEMO_USERNAME}@paytrace.local`,
  aud: 'authenticated',
  role: 'authenticated',
  app_metadata: { provider: 'email' },
  user_metadata: { username: DEMO_USERNAME },
  created_at: '2026-07-01T00:00:00.000Z'
}
const DEMO_SESSION = {
  access_token: 'demo-local-token',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: 4102444800,
  refresh_token: 'demo-local-refresh',
  user: DEMO_USER
}

function sessionEnabled() {
  const s = safeStorage()
  try { return !s || s.getItem(SESSION_KEY) !== '0' } catch { return true }
}
function setSessionEnabled(on) {
  const s = safeStorage()
  try { s?.setItem(SESSION_KEY, on ? '1' : '0') } catch { /* noop */ }
}

function createAuth() {
  return {
    async getSession() {
      return { data: { session: sessionEnabled() ? DEMO_SESSION : null }, error: null }
    },
    async getUser() {
      return {
        data: { user: sessionEnabled() ? DEMO_USER : null },
        error: sessionEnabled() ? null : { message: '未登录' }
      }
    },
    onAuthStateChange(callback) {
      // 与真实 SDK 一致：注册后异步推送一次当前会话
      Promise.resolve().then(() => {
        try { callback('SIGNED_IN', sessionEnabled() ? DEMO_SESSION : null) } catch { /* noop */ }
      })
      return { data: { subscription: { unsubscribe() {} } } }
    },
    async signInWithPassword() {
      setSessionEnabled(true)
      return { data: { session: DEMO_SESSION, user: DEMO_USER }, error: null }
    },
    async signUp({ options } = {}) {
      setSessionEnabled(true)
      const username = options?.data?.username || DEMO_USERNAME
      return {
        data: {
          session: DEMO_SESSION,
          user: { ...DEMO_USER, email: `${username}@paytrace.local`, user_metadata: { username } }
        },
        error: null
      }
    },
    async signOut() {
      setSessionEnabled(false)
      return { error: null }
    }
  }
}

// ------------------------------------------------------------
// 演示客户端同样执行真实库的关键 CHECK 约束（0001_init.sql）：
// 避免「演示能写进去、切真实 Supabase 就报错」的假成功。
// 同时把中文方向 / 来源归一为库内枚举。
// ------------------------------------------------------------
const DIRECTION_ALIAS = { 收入: 'income', 支出: 'expense', income: 'income', expense: 'expense' }
const SOURCE_ALIAS = { 手动: 'manual', ai: 'ai', manual: 'manual' }
function normalizeAndValidateRow(table, p) {
  const row = { ...p }
  if (table === 'transaction') {
    row.direction = DIRECTION_ALIAS[row.direction] || row.direction
    row.source = SOURCE_ALIAS[row.source] || row.source
    if (!['income', 'expense'].includes(row.direction)) return { error: 'direction 必须是 income / expense' }
    if (!Number.isFinite(Number(row.amount)) || Number(row.amount) <= 0) return { error: 'amount 必须是正数' }
    if (!['manual', 'ai'].includes(row.source)) return { error: 'source 必须是 manual / ai' }
    if (!row.txn_date) return { error: 'txn_date 不能为空' }
  }
  if (table === 'pending_income') {
    if (!String(row.type || '').trim()) return { error: '待收项目不能为空' }
    if (!Number.isFinite(Number(row.est_amount)) || Number(row.est_amount) < 0) return { error: '预估金额必须是非负数' }
  }
  if (table === 'repayment_event' && (!row.due_date || !(Number(row.amount) > 0))) {
    return { error: '还款日与正数金额必填' }
  }
  return { row }
}

// ------------------------------------------------------------
// 查询构造器：只实现项目用到的链式方法，thenable 让 await / Promise.all 正常工作
// ------------------------------------------------------------
const looseEq = (a, b) => String(a ?? '') === String(b ?? '')
const compare = (a, b) => {
  if (a == null || b == null) return 0
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b), 'zh-CN')
}

class DemoQuery {
  constructor(table) {
    this.table = table
    this._mode = 'select'
    this._filters = []
    this._orders = []
    this._limit = null
    this._single = null
    this._payload = null
    this._onConflict = null
    this._returning = false
  }

  select() {
    if (this._mode === 'insert' || this._mode === 'update' ||
        this._mode === 'delete' || this._mode === 'upsert') this._returning = true
    else this._mode = 'select'
    return this
  }
  insert(payload) { this._mode = 'insert'; this._payload = payload; return this }
  update(patch) { this._mode = 'update'; this._payload = patch; return this }
  upsert(payload, opts) { this._mode = 'upsert'; this._payload = payload; this._onConflict = opts?.onConflict || null; return this }
  delete() { this._mode = 'delete'; return this }

  eq(col, val) { this._filters.push((r) => looseEq(r[col], val)); return this }
  gte(col, val) { this._filters.push((r) => compare(r[col], val) >= 0); return this }
  lte(col, val) { this._filters.push((r) => compare(r[col], val) <= 0); return this }
  in(col, values) { const list = values || []; this._filters.push((r) => list.some((v) => looseEq(r[col], v))); return this }
  order(col, opts) { this._orders.push({ col, asc: opts?.ascending !== false }); return this }
  limit(n) { this._limit = n; return this }
  maybeSingle() { this._single = 'maybe'; return this }
  single() { this._single = 'single'; return this }

  then(resolve, reject) {
    return Promise.resolve().then(() => this._exec()).then(resolve, reject)
  }

  _exec() {
    const db = readDb()
    const rows = Array.isArray(db[this.table]) ? db[this.table].slice() : []
    const matches = (row) => this._filters.every((f) => f(row))

    const finish = (data) => {
      if (this._single === 'single') {
        return { data: data ?? null, error: data ? null : { message: '未找到匹配记录' } }
      }
      if (this._single === 'maybe') return { data: data ?? null, error: null }
      return { data: Array.isArray(data) ? data : (data == null ? [] : [data]), error: null }
    }

    if (this._mode === 'select') {
      let out = rows.filter(matches)
      for (const o of this._orders.slice().reverse()) {
        out.sort((a, b) => (o.asc ? 1 : -1) * compare(a[o.col], b[o.col]))
      }
      if (this._limit != null) out = out.slice(0, this._limit)
      return this._single ? finish(out[0]) : finish(out)
    }

    if (this._mode === 'insert') {
      const payloads = Array.isArray(this._payload) ? this._payload : [this._payload]
      const normalized = []
      for (const p of payloads) {
        const v = normalizeAndValidateRow(this.table, p)
        if (v.error) return { data: null, error: { message: `[演示模式约束] ${v.error}` } }
        normalized.push(v.row)
      }
      const inserted = normalized.map((p) => ({
        id: ++db._seq,
        created_at: nowISO(),
        ...p
      }))
      db[this.table] = [...rows, ...inserted]
      writeDb(db)
      const result = this._single ? inserted[0] : inserted
      return this._returning ? finish(result) : { data: null, error: null }
    }

    if (this._mode === 'upsert') {
      const p = this._payload || {}
      const conflictKey = this._onConflict || 'id'
      const idx = rows.findIndex((r) => looseEq(r[conflictKey], p[conflictKey]))
      let saved
      if (idx >= 0) {
        saved = { ...rows[idx], ...p }
        rows[idx] = saved
      } else {
        saved = { id: ++db._seq, created_at: nowISO(), ...p }
        rows.push(saved)
      }
      db[this.table] = rows
      writeDb(db)
      return this._returning ? finish(saved) : { data: null, error: null }
    }

    if (this._mode === 'update') {
      const touched = []
      db[this.table] = rows.map((r) => {
        if (!matches(r)) return r
        const next = { ...r, ...(this._payload || {}) }
        touched.push(next)
        return next
      })
      writeDb(db)
      const result = this._single ? touched[0] : touched
      return this._returning ? finish(result) : { data: null, error: null }
    }

    if (this._mode === 'delete') {
      const removed = rows.filter(matches)
      db[this.table] = rows.filter((r) => !matches(r))
      writeDb(db)
      const result = this._single ? removed[0] : removed
      return this._returning ? finish(result) : { data: null, error: null }
    }

    return { data: [], error: null }
  }
}

export function createDemoClient() {
  seedPreferences()
  readDb()
  return {
    auth: createAuth(),
    from(table) { return new DemoQuery(table) }
  }
}

// ------------------------------------------------------------
// AI 能力模拟：不联网、不写密钥，只按本地规则给出结构化结果
// ------------------------------------------------------------
const CATEGORY_HINTS = [
  [/午饭|午餐|快餐|吃饭|餐饮|食堂|外卖/, '午餐'],
  [/早饭|早餐|豆浆|包子/, '早餐'],
  [/晚饭|晚餐/, '晚餐'],
  [/打车|滴滴|出租|网约车/, '打车'],
  [/地铁|公交|通勤|公交卡/, '通勤'],
  [/话费|充值|手机费/, '话费'],
  [/奶茶|咖啡|饮料|买水/, '饮品'],
  [/药|看病|医院/, '药品'],
  [/电影|票|游戏|会员/, '娱乐'],
  [/鞋|衣服|裤|服饰|淘宝|京东/, '服饰'],
  [/房租|租金/, '房租'],
  [/超市|日用品|购物/, '日用'],
  [/零食/, '零食']
]

function inferCategory(text) {
  for (const [re, name] of CATEGORY_HINTS) if (re.test(text)) return name
  return '其他'
}

// 本地日期加减（不碰 UTC，避免 GMT+8 把日期算错一天）
function shiftDate(iso, delta) {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + delta)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// 逐段解析相对日期；若本段没写日期，沿用前一段已解析出的日期
function resolveChunkDate(chunk, today, inherited) {
  if (/前天/.test(chunk)) return shiftDate(today, -2)
  if (/昨天|昨日/.test(chunk)) return shiftDate(today, -1)
  if (/今天|今日/.test(chunk)) return today
  const md = chunk.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]?/)
  if (md) {
    const year = new Date(`${today}T00:00:00`).getFullYear()
    return `${year}-${String(Number(md[1])).padStart(2, '0')}-${String(Number(md[2])).padStart(2, '0')}`
  }
  const dm = chunk.match(/(\d{1,2})\s*[日号]/)
  if (dm) {
    const d = new Date(`${today}T00:00:00`)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(Number(dm[1])).padStart(2, '0')}`
  }
  return inherited
}

function parseDemoNote(text) {
  const today = localISO()
  const chunks = String(text || '').split(/[，,、;；。\n]+/).map((s) => s.trim()).filter(Boolean)
  const items = []
  let inherited = today
  for (const chunk of chunks) {
    const date = resolveChunkDate(chunk, today, inherited)
    inherited = date
    // 「3块5」先折成 3.5，再按数字取金额，避免取到角位 5
    const normalized = chunk.replace(/(\d+)块(\d)(?!\d)/g, '$1.$2')
    const amounts = [...normalized.matchAll(/(\d+(?:\.\d+)?)\s*(?:元|块|块钱)?/g)]
      .map((m) => Number(m[1])).filter((n) => Number.isFinite(n) && n > 0)
    if (!amounts.length) continue
    const isIncome = /工资|收入|报销|到账|收到|奖金|补贴|退款/.test(chunk)
    const category = isIncome ? (/工资/.test(chunk) ? '工资' : '其他收入') : inferCategory(chunk)
    items.push({
      date,
      direction: isIncome ? '收入' : '支出',
      category,
      amount: amounts[amounts.length - 1],
      note: chunk,
      confidence: 0.88
    })
  }
  if (!items.length) {
    items.push({
      date: today, direction: '支出', category: inferCategory(text || ''),
      amount: null, note: String(text || ''), confidence: 0.42
    })
  }
  return { items, confidence: Math.min(...items.map((i) => i.confidence)) }
}

export async function demoAgnes(action, payload = {}) {
  // 模拟一次网络往返，保持 loading 态可见
  await new Promise((resolve) => setTimeout(resolve, 420))
  if (action === 'parse_note') return parseDemoNote(payload.text)
  if (action === 'advise_purchase') {
    const ctx = payload.context || {}
    const text = String(payload.text ?? '')
    // 真正使用用户输入：提取想买的东西与价格，不再返回写死的模板文案
    const amount = Number((text.match(/(\d+(?:\.\d+)?)\s*(?:元|块)?/) || [])[1]) || 0
    const item = text.replace(/\d+(?:\.\d+)?\s*(?:元|块|块钱)?/g, '').replace(/想买|买个|一双|一个|该不该|能不能/g, '').trim() || '这件东西'
    const min = Number(ctx.monthMinBalance ?? 0)
    const cur = Number(ctx.currentBalance ?? 0)
    const upcoming = Array.isArray(ctx.upcomingRepayments) ? ctx.upcomingRepayments : []
    const nearTotal = upcoming
      .filter((r) => Number(r.daysFromToday) >= 0 && Number(r.daysFromToday) <= 7)
      .reduce((s, r) => s + (Number(r.amount) || 0), 0)
    const priceText = amount > 0 ? `${amount.toFixed(2)} 元` : '未标明金额'
    const repayText = nearTotal > 0 ? `，未来 7 天内还有 ${nearTotal.toFixed(2)} 元待还` : ''
    const risky = min < 0 || cur < 200 || (amount > 0 && cur - amount < 0)
    return {
      result: {
        advice: risky ? '暂时别买' : '可以买',
        reason: risky
          ? `你想买的「${item}」约 ${priceText}；按当前档案推演，本月最低余额约 ${min.toFixed(2)} 元、当前可用约 ${cur.toFixed(2)} 元${repayText}。这笔支出会让现金安全垫更薄，建议先留足还款与生活开支。`
          : `你想买的「${item}」约 ${priceText}；按当前档案推演，本月最低余额约 ${min.toFixed(2)} 元${repayText}，这笔支出在可承受范围内，可按计划安排。`,
        risk_level: risky ? '偏高' : '较低',
        disclaimer: '以上基于你本机的演示数据与推演假设，仅供参考，不构成理财建议，不承诺任何收益。'
      }
    }
  }
  return { result: {} }
}
