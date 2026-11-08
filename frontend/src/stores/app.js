// ============================================================
// app store · 业务档案集中存储（跨页共享、响应式 + 三级缓存）
// ------------------------------------------------------------
// 缓存：内存 → 本地缓存 → Supabase。低频数据 12 小时内不重复请求；
//       并发 load 去重；写操作同步更新 state 与缓存。
// 数据红线：所有写库 action 都先过 validation.js，store 是最后一道防线。
// 薪资：变更追加新版本而非覆盖，按创建时间 + id 取最新一版生效。
// ============================================================
import { defineStore } from 'pinia'
import { supabase } from '../lib/supabase'
import { useAuthStore } from './auth'
import { readCache, writeCache } from '../lib/cache'
import { trackEvent } from '../lib/analytics'
import { setHolidayCalendar } from '../lib/holidays2026'
import { broadcastFlowChange } from '../lib/flowChannel'
import { CACHE_TTL } from '../lib/constants'
import { setBackendAdapter } from '../lib/prefs'
import {
  validateProfile, validateSalary, validateExpense,
  validateRepayment, validateLiability,
  validateExpensePatch, validateLiabilityPatch, validateRepaymentStatus
} from '../lib/validation'

const CACHE_KEY = 'business-archive'
// inflight 记录发起请求的账号：账号切换时旧响应必须被丢弃，不能写进新账号的 state / 缓存
let inflight = null // { uid, promise }

export const useAppStore = defineStore('app', {
  state: () => ({
    profile: null,
    salaryConfig: null,
    expenses: [],
    repayments: [],
    liabilities: [],
    insuranceRules: [],
    // 已记流水：推演引擎据此叠加「预算之外的实际发生额」（PRD FR-07/FR-09）
    transactions: [],
    // 待收收入：AI 购物劝导判断「补贴尚未到账」的上下文（FR-13）
    pendingIncome: [],
    // 运营维护的法定节假日 / 调休表（FR-15），全局只读
    holidayCalendar: [],
    salaryHistory: [],
    balanceLog: [],
    loading: false,
    lastLoadedAt: 0,
    cacheUid: null
  }),
  getters: {
    isReady: (s) => s.lastLoadedAt > 0,
    isStale: (s) => Date.now() - s.lastLoadedAt > CACHE_TTL,
    totalRemaining: (s) => Number(
      s.liabilities.reduce((a, l) => a + (Number(l.remaining_principal) || 0), 0).toFixed(2)
    )
  },
  actions: {
    // uid 由调用方捕获后传入：账号切换时不能用「当前」userId 决定缓存归属
    // 写操作不传 uid 时优先用已绑定的 cacheUid：账号在 await 期间切换时，
    // 不会把 A 的档案写进 B 的缓存（修复跨账号串写）。
    _persist(uid = null) {
      const owner = uid || this.cacheUid || useAuthStore().userId
      if (!owner) return
      this.cacheUid = owner
      writeCache(owner, CACHE_KEY, {
        profile: this.profile,
        salaryConfig: this.salaryConfig,
        expenses: this.expenses,
        repayments: this.repayments,
        liabilities: this.liabilities,
        insuranceRules: this.insuranceRules,
        transactions: this.transactions,
        pendingIncome: this.pendingIncome,
        holidayCalendar: this.holidayCalendar,
        balanceLog: this.balanceLog,
        t: Date.now()
      })
    },
    async load({ force = false } = {}) {
      const uid = useAuthStore().userId
      if (!uid) return

      // 账号切换后，内存里的旧档案必须整体作废
      if (this.cacheUid && this.cacheUid !== uid) {
        this.$reset()
        inflight = null
      }
      // 同账号复用在途请求；其它账号的在途请求直接丢弃，避免 B 复用 A 的响应
      if (inflight && inflight.uid === uid) return inflight.promise
      if (inflight && inflight.uid !== uid) inflight = null

      if (!force) {
        if (this.lastLoadedAt && this.cacheUid === uid && !this.isStale) return
        const cached = readCache(uid, CACHE_KEY, CACHE_TTL)
        // 旧版缓存没有 transactions 字段：必须视为失效并回源补齐，
        // 否则升级后推演永远读不到已记流水（预测不会随记账更新）
        // 同时：0004 迁移新增的 profiles 列（current_balance 等）若不在缓存中，
        // 说明是迁移前的旧缓存，必须回源，否则首页真实余额读不到后端值。
        if (cached && Array.isArray(cached.transactions) &&
            cached.profile && 'current_balance' in cached.profile) {
          this.profile = cached.profile || null
          this.salaryConfig = cached.salaryConfig || null
          this.expenses = cached.expenses || []
          this.repayments = cached.repayments || []
          this.liabilities = cached.liabilities || []
          this.insuranceRules = cached.insuranceRules || []
          this.transactions = cached.transactions || []
          this.pendingIncome = cached.pendingIncome || []
          this.holidayCalendar = cached.holidayCalendar || []
          this.balanceLog = cached.balanceLog || []
          setHolidayCalendar(this.holidayCalendar)
          this.lastLoadedAt = cached.t || Date.now()
          this.cacheUid = uid
          return
        }
      }

      this.loading = true
      const promise = (async () => {
        try {
          // 只取近 12 个月流水：覆盖当月曲线与未来前瞻；用游标分页拉全量，
          // 避免 .limit(1000) 静默截断导致日历 / 推演 / 对账缺数据（P1-1）
          const since = new Date()
          since.setMonth(since.getMonth() - 12)
          const sinceISO = `${since.getFullYear()}-${String(since.getMonth() + 1).padStart(2, '0')}-01`
          // 游标分页拉全部流水，单页 1000，循环直到取完；设软上限保护极端数据
          const fetchAllTransactions = async () => {
            const rows = []
            const PAGE = 1000
            const MAX_TXN = 5000
            let from = 0
            for (;;) {
              const { data, error } = await supabase
                .from('transaction')
                .select('*')
                .eq('user_id', uid)
                .gte('txn_date', sinceISO)
                .order('txn_date')
                .range(from, from + PAGE - 1)
              if (error) return { data: null, error }
              const page = data || []
              rows.push(...page)
              if (page.length < PAGE || rows.length >= MAX_TXN) break
              from += PAGE
            }
            return { data: rows, error: null }
          }
          const [p, sc, ec, re, li, ir, tr, pi, hc, bl] = await Promise.all([
            supabase.from('profiles').select('*').eq('user_id', uid).maybeSingle(),
            supabase.from('salary_config').select('*').eq('user_id', uid)
              .order('created_at', { ascending: false })
              .order('id', { ascending: false }).limit(1).maybeSingle(),
            supabase.from('expense_category').select('*').eq('user_id', uid).order('deduct_day'),
            supabase.from('repayment_event').select('*').eq('user_id', uid).order('due_date'),
            supabase.from('liability').select('*').eq('user_id', uid).order('created_at'),
            // 全局只读模板表（RLS 允许认证用户读）。返回空数组是允许的：
            // 引擎会回落内置兜底比例；但查询报错必须按档案加载失败抛出。
            supabase.from('insurance_rule').select('*').eq('is_active', true),
            fetchAllTransactions(),
            supabase.from('pending_income').select('*').eq('user_id', uid),
            // FR-15：运营年度维护的节假日 / 调休表，全局只读
            supabase.from('holiday_calendar').select('holiday_date,day_type,year,note'),
            // 余额变动台账（后端存储，替代仅前端 localStorage 的台账）
            supabase.from('balance_log').select('*').eq('user_id', uid).order('changed_at')
          ])
          // 任何一条查询失败都不能静默降级成「空档案」，
          // 否则用户会看到全 0 的数字，误以为数据丢了
          const queryError = p.error || sc.error || ec.error || re.error || li.error || ir.error
          if (queryError) throw new Error(`档案加载失败：${queryError.message}`)
          // 请求期间可能已切换账号：丢弃过期响应，绝不写进当前 state / 新账号缓存
          if (useAuthStore().userId !== uid) return
          this.profile = p.data || null
          this.salaryConfig = sc.data || null
          this.expenses = ec.data || []
          this.repayments = re.data || []
          this.liabilities = li.data || []
          this.insuranceRules = ir.data || []
          // 流水查询失败不阻断档案：预测退回纯档案口径，但保留已有值，不静默造假
          if (tr.error) {
            console.warn('[paytrace] 流水加载失败，本次推演暂不含已记流水：', tr.error.message)
          } else {
            this.transactions = tr.data || []
          }
          this.pendingIncome = pi.error ? this.pendingIncome : (pi.data || [])
          // 节假日表是增强数据：失败或为空都回落本地静态表，不阻断档案
          this.holidayCalendar = hc.error ? [] : (hc.data || [])
          setHolidayCalendar(this.holidayCalendar)
          // 余额台账后端优先；查询失败回落本地（prefs 内部已维护本地台账）
          this.balanceLog = bl.error ? this.balanceLog : (bl.data || [])
          this.lastLoadedAt = Date.now()
          this._persist(uid)
        } finally {
          this.loading = false
          if (inflight && inflight.uid === uid) inflight = null
        }
      })()
      inflight = { uid, promise }
      return promise
    },
    async loadSalaryHistory() {
      const uid = useAuthStore().userId
      if (!uid) return
      const { data, error } = await supabase.from('salary_config')
        .select('*').eq('user_id', uid)
        .order('created_at', { ascending: false }).order('id', { ascending: false })
      if (!error) this.salaryHistory = data || []
    },
    async saveProfile(payload) {
      const checked = validateProfile(payload)
      if (!checked.ok) throw new Error(checked.error)
      const { error } = await supabase
        .from('profiles')
        .upsert({ user_id: useAuthStore().userId, ...checked.value }, { onConflict: 'user_id' })
      if (error) throw error
      this.profile = { ...(this.profile || {}), ...checked.value }
      this._persist()
      trackEvent('param_saved', { table: 'profiles' }, `profiles:${Date.now()}`)
    },
    // 追加新版本：不覆盖旧档案，历史月份仍可回溯
    async saveSalary(payload) {
      const checked = validateSalary(payload)
      if (!checked.ok) throw new Error(checked.error)
      const uid = useAuthStore().userId
      const { error } = await supabase.from('salary_config').insert({ user_id: uid, ...checked.value })
      if (error) throw error
      const { data, error: e2 } = await supabase.from('salary_config')
        .select('*').eq('user_id', uid)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false }).limit(1).maybeSingle()
      if (e2) throw e2
      this.salaryConfig = data
      if (this.salaryHistory.length) this.salaryHistory = [data, ...this.salaryHistory]
      this.lastLoadedAt = Date.now()
      this._persist()
      trackEvent('param_saved', { table: 'salary_config' }, `salary:${Date.now()}`)
    },
    async addExpense(payload) {
      const checked = validateExpense(payload)
      if (!checked.ok) throw new Error(checked.error)
      const { data, error } = await supabase
        .from('expense_category')
        .insert({ user_id: useAuthStore().userId, ...checked.value })
        .select().single()
      if (error) throw error
      this.expenses = [...this.expenses, data]
      this._persist()
    },
    async delExpense(id) {
      const { error } = await supabase.from('expense_category').delete().eq('id', id)
      if (error) throw error
      this.expenses = this.expenses.filter((e) => e.id !== id)
      this._persist()
    },
    async addRepayment(payload) {
      const checked = validateRepayment(payload)
      if (!checked.ok) throw new Error(checked.error)
      const { data, error } = await supabase
        .from('repayment_event')
        .insert({ user_id: useAuthStore().userId, ...checked.value })
        .select().single()
      if (error) throw error
      this.repayments = [...this.repayments, data]
      this._persist()
    },
    async delRepayment(id) {
      const { error } = await supabase.from('repayment_event').delete().eq('id', id)
      if (error) throw error
      this.repayments = this.repayments.filter((r) => r.id !== id)
      this._persist()
    },
    async addLiability(payload) {
      const checked = validateLiability(payload)
      if (!checked.ok) throw new Error(checked.error)
      const { data, error } = await supabase
        .from('liability')
        .insert({ user_id: useAuthStore().userId, ...checked.value })
        .select().single()
      if (error) throw error
      this.liabilities = [...this.liabilities, data]
      this._persist()
    },
    async delLiability(id) {
      const { error } = await supabase.from('liability').delete().eq('id', id)
      if (error) throw error
      this.liabilities = this.liabilities.filter((l) => l.id !== id)
      this._persist()
    },
    // ============================================================
    // 编辑类写操作：先过 validation.js，update 成功后才用数据库返回行
    // 覆盖本地 state，保证本地与库内一致；任何一步失败都不改本地、不写缓存。
    // ============================================================
    async updateExpense(id, patch) {
      const checked = validateExpensePatch(patch)
      if (!checked.ok) throw new Error(checked.error)
      const { data, error } = await supabase.from('expense_category')
        .update(checked.value).eq('id', id).select().single()
      if (error) throw error
      this.expenses = this.expenses.map((e) => (e.id === id ? { ...e, ...data } : e))
      this._persist()
    },
    async updateLiability(id, patch) {
      const row = this.liabilities.find((l) => l.id === id) || {}
      const checked = validateLiabilityPatch(patch, row)
      if (!checked.ok) throw new Error(checked.error)
      const { data, error } = await supabase.from('liability')
        .update(checked.value).eq('id', id).select().single()
      if (error) throw error
      this.liabilities = this.liabilities.map((l) => (l.id === id ? { ...l, ...data } : l))
      this._persist()
    },
    async setRepaymentStatus(id, status) {
      const checked = validateRepaymentStatus(status)
      if (!checked.ok) throw new Error(checked.error)
      const { data, error } = await supabase.from('repayment_event')
        .update({ status: checked.value }).eq('id', id).select().single()
      if (error) throw error
      this.repayments = this.repayments.map((r) => (r.id === id ? { ...r, ...data } : r))
      this._persist()
    },
    // 记一笔 / 删除 / AI 写入 / 标记到账后调用：只重拉流水，避免整份档案回源
    // silent=true：跨标签页同步时用，不写缓存、不派发事件，避免广播 / storage 循环
    async reloadTransactions({ silent = false } = {}) {
      const uid = this.cacheUid || useAuthStore().userId
      if (!uid) return []
      const since = new Date()
      since.setMonth(since.getMonth() - 12)
      const sinceISO = `${since.getFullYear()}-${String(since.getMonth() + 1).padStart(2, '0')}-01`
      // 同时刷新待收收入：AI 购物劝导判断「补贴尚未到账」要用（FR-13）
      const [txnRes, pendRes] = await Promise.all([
        supabase.from('transaction')
          .select('*').eq('user_id', uid).gte('txn_date', sinceISO).order('txn_date').limit(1000),
        supabase.from('pending_income').select('*').eq('user_id', uid)
      ])
      if (txnRes.error) throw txnRes.error
      this.transactions = txnRes.data || []
      if (!pendRes.error) this.pendingIncome = pendRes.data || []
      if (!silent) {
        this._persist(uid)
        broadcastFlowChange()
        if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined') {
          window.dispatchEvent(new CustomEvent('paytrace:transactions-changed'))
        }
      }
      return this.transactions
    },
    // ============================================================
    // 后端存储：把当前余额 / 每月固定还款 / 年内历史薪资 落到 profiles
    // （替代仅前端 localStorage 的存储，换设备 / 清缓存不丢）
    // 余额变动同时写 balance_log 台账（append-only）
    // ============================================================
    registerPrefsAdapter() {
      setBackendAdapter({
        getProfile: () => this.profile,
        getBalanceLog: () => this.balanceLog,
        saveCurrentBalance: (v, rec) => this.saveCurrentBalance(v, rec),
        saveRecurringRepayment: (v) => this.saveRecurringRepayment(v),
        saveSalaryYtd: (arr) => this.saveSalaryYtd(arr)
      })
    },
    async saveCurrentBalance(value, rec = {}) {
      const uid = useAuthStore().userId
      if (!uid) return
      const c = Math.round(Number(value) * 100) / 100
      const fromC = rec.from != null ? Math.round(Number(rec.from) * 100) / 100 : null
      const deltaC = fromC == null ? null : Math.round((c - fromC) * 100) / 100
      const now = new Date().toISOString()
      const { error: e1 } = await supabase
        .from('profiles')
        .upsert({ user_id: uid, current_balance: c, updated_at: now }, { onConflict: 'user_id' })
      if (e1) console.warn('[paytrace] 余额写后端失败：', e1.message)
      const { error: e2 } = await supabase.from('balance_log').insert({
        user_id: uid,
        balance_date: rec.date || null,
        from_amount: fromC,
        to_amount: c,
        delta: deltaC,
        reason: String(rec.reason || '手动更新余额').slice(0, 120),
        kind: rec.kind || 'update'
      })
      if (e2) console.warn('[paytrace] 余额台账写后端失败：', e2.message)
      if (this.profile) this.profile = { ...this.profile, current_balance: c, updated_at: now }
      this._persist()
    },
    async saveRecurringRepayment(value) {
      const uid = useAuthStore().userId
      if (!uid) return
      const v = Math.max(0, Number(value) || 0)
      const now = new Date().toISOString()
      const { error } = await supabase
        .from('profiles')
        .upsert({ user_id: uid, recurring_repayment: v, updated_at: now }, { onConflict: 'user_id' })
      if (error) console.warn('[paytrace] 每月固定还款写后端失败：', error.message)
      if (this.profile) this.profile = { ...this.profile, recurring_repayment: v, updated_at: now }
      this._persist()
    },
    async saveSalaryYtd(arr) {
      const uid = useAuthStore().userId
      if (!uid) return
      const now = new Date().toISOString()
      const { error } = await supabase
        .from('profiles')
        .upsert({ user_id: uid, salary_ytd: arr, updated_at: now }, { onConflict: 'user_id' })
      if (error) console.warn('[paytrace] 历史薪资写后端失败：', error.message)
      if (this.profile) this.profile = { ...this.profile, salary_ytd: arr, updated_at: now }
      this._persist()
    },
    invalidate() {
      this.lastLoadedAt = 0
    },
    // 手动强制刷新：绕过缓存，重新拉取档案
    async refresh() {
      return this.load({ force: true })
    }
  }
})
