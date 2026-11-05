// ============================================================
// auth store · 集中管理登录态
// ------------------------------------------------------------
// 用户名方案：底层身份仍是 Supabase user，邮箱为 用户名@paytrace.local 别名。
// 所有页面统一从这里取 userId / username，消除各视图重复 getUser() 与别名剥离逻辑。
// 账号切换必须同步切换本机偏好作用域，避免下一个账号读到上一个人的数据。
// ============================================================
import { defineStore } from 'pinia'
import { supabase } from '../lib/supabase'
import { clearCache } from '../lib/cache'
import { setPrefScope, clearPrefs } from '../lib/prefs'
import { invalidatePrivacyMask } from '../lib/privacy'

const ALIAS_SUFFIX = '@paytrace.local'
const toLoginEmail = (u) => u.trim().toLowerCase() + ALIAS_SUFFIX
const stripAlias = (email) => (email ? email.replace(ALIAS_SUFFIX, '') : '')

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null,
    loading: true,
    _ready: null
  }),
  getters: {
    isAuthenticated: (s) => !!s.user,
    userId: (s) => s.user?.id || null,
    email: (s) => s.user?.email || '',
    username: (s) => stripAlias(s.user?.email || '')
  },
  actions: {
    // 幂等：整个 app 生命周期只初始化一次
    ensureReady() {
      if (!this._ready) {
        this._ready = (async () => {
          try {
            const { data: { user } } = await supabase.auth.getUser()
            this.user = user
            setPrefScope(user?.id || '')
          } catch {
            this.user = null
            setPrefScope('')
          } finally {
            this.loading = false
            supabase.auth.onAuthStateChange((_event, session) => {
              this.user = session?.user ?? null
              setPrefScope(session?.user?.id || '')
              invalidatePrivacyMask()
            })
          }
        })()
      }
      return this._ready
    },
    async login(username, password) {
      const { error } = await supabase.auth.signInWithPassword({
        email: toLoginEmail(username),
        password
      })
      if (error) throw error
      const { data: { user } } = await supabase.auth.getUser()
      this.user = user
      setPrefScope(user?.id || '')
      invalidatePrivacyMask()
    },
    async register(username, password) {
      const { data, error } = await supabase.auth.signUp({
        email: toLoginEmail(username),
        password,
        options: { data: { username: username.trim() } }
      })
      if (error) throw error
      if (data.session) {
        this.user = data.session.user
        setPrefScope(data.session.user?.id || '')
        invalidatePrivacyMask()
      }
      return { session: data.session }
    },
    async logout() {
      const uid = this.userId
      await supabase.auth.signOut()
      // 清档案缓存 + 清当前账号的本机偏好（含年内真实薪资），避免下一个账号串数据
      clearCache(uid)
      clearPrefs()
      invalidatePrivacyMask()
      this.user = null
    }
  }
})
