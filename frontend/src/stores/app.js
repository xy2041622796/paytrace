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
import { CACHE_TTL } from '../lib/constants'
import {
  validateProfile, validateSalary, validateExpense,
  validateRepayment, validateLiability,
  validateExpensePatch, validateLiabilityPatch, validateRepaymentStatus
} from '../lib/validation'

const CACHE_KEY = 'business-archive'
let inflight = null

export const useAppStore = defineStore('app', {
  state: () => ({
    profile: null,
    salaryConfig: null,
    expenses: [],
    repayments: [],
    liabilities: [],
    insuranceRules: [],
    salaryHistory: [],
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
    _persist() {
      const uid = useAuthStore().userId
      this.cacheUid = uid
      writeCache(uid, CACHE_KEY, {
        profile: this.profile,
        salaryConfig: this.salaryConfig,
        expenses: this.expenses,
        repayments: this.repayments,
        liabilities: this.liabilities,
        insuranceRules: this.insuranceRules,
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
      if (inflight) return inflight

      if (!force) {
        if (this.lastLoadedAt && this.cacheUid === uid && !this.isStale) return
        const cached = readCache(uid, CACHE_KEY, CACHE_TTL)
        if (cached) {
          this.profile = cached.profile || null
          this.salaryConfig = cached.salaryConfig || null
          this.expenses = cached.expenses || []
          this.repayments = cached.repayments || []
          this.liabilities = cached.liabilities || []
          this.insuranceRules = cached.insuranceRules || []
          this.lastLoadedAt = cached.t || Date.now()
          this.cacheUid = uid
          return
        }
      }

      this.loading = true
      inflight = (async () => {
        try {
          const [p, sc, ec, re, li, ir] = await Promise.all([
            supabase.from('profiles').select('*').eq('user_id', uid).maybeSingle(),
            supabase.from('salary_config').select('*').eq('user_id', uid)
              .order('created_at', { ascending: false })
              .order('id', { ascending: false }).limit(1).maybeSingle(),
            supabase.from('expense_category').select('*').eq('user_id', uid).order('deduct_day'),
            supabase.from('repayment_event').select('*').eq('user_id', uid).order('due_date'),
            supabase.from('liability').select('*').eq('user_id', uid).order('created_at'),
            // 全局只读模板表（RLS 允许认证用户读）。返回空数组是允许的：
            // 引擎会回落内置兜底比例；但查询报错必须按档案加载失败抛出。
            supabase.from('insurance_rule').select('*').eq('is_active', true)
          ])
          // 任何一条查询失败都不能静默降级成「空档案」，
          // 否则用户会看到全 0 的数字，误以为数据丢了
          const queryError = p.error || sc.error || ec.error || re.error || li.error || ir.error
          if (queryError) throw new Error(`档案加载失败：${queryError.message}`)
          this.profile = p.data || null
          this.salaryConfig = sc.data || null
          this.expenses = ec.data || []
          this.repayments = re.data || []
          this.liabilities = li.data || []
          this.insuranceRules = ir.data || []
          this.lastLoadedAt = Date.now()
          this._persist()
        } finally {
          this.loading = false
          inflight = null
        }
      })()
      return inflight
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
    invalidate() {
      this.lastLoadedAt = 0
    },
    // 手动强制刷新：绕过缓存，重新拉取档案
    async refresh() {
      return this.load({ force: true })
    }
  }
})
