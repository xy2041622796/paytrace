// ============================================================
// theme store · 浅色/深色主题
// 单一数据源：<html data-theme> 驱动 styles/theme.css 的 --c-* 变量；
// Naive UI 由 App.vue 的 darkTheme 跟随；ECharts 由组件 watch 重绘。
// 持久化到 localStorage，未手动选择过时跟随系统偏好。
// ============================================================
import { defineStore } from 'pinia'

const STORAGE_KEY = 'paytrace-theme'
const DARK_QUERY = '(prefers-color-scheme: dark)'
const isMode = (v) => v === 'light' || v === 'dark'

function readSaved() {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return isMode(v) ? v : null
  } catch {
    return null
  }
}

function apply(mode) {
  const root = document.documentElement
  root.dataset.theme = mode
  root.style.colorScheme = mode
}

export const useThemeStore = defineStore('theme', {
  state: () => ({
    mode: 'light',
    manual: false // 手动切换后不再被系统主题变化覆盖
  }),
  getters: {
    isDark: (s) => s.mode === 'dark'
  },
  actions: {
    init() {
      const saved = readSaved()
      this.manual = !!saved
      this.mode = saved || (window.matchMedia?.(DARK_QUERY).matches ? 'dark' : 'light')
      apply(this.mode)

      const mq = window.matchMedia?.(DARK_QUERY)
      if (!mq) return
      const onChange = (e) => {
        if (this.manual) return
        this.mode = e.matches ? 'dark' : 'light'
        apply(this.mode)
      }
      if (mq.addEventListener) mq.addEventListener('change', onChange)
      else if (mq.addListener) mq.addListener(onChange)
    },
    setMode(mode) {
      if (!isMode(mode)) return
      this.mode = mode
      this.manual = true
      apply(mode) // 同步写 DOM，保证 ECharts 重绘时能读到新变量
      try {
        localStorage.setItem(STORAGE_KEY, mode)
      } catch {
        // 隐私模式：仅本次会话生效，不阻断切换
      }
    },
    toggle() {
      this.setMode(this.mode === 'dark' ? 'light' : 'dark')
    }
  }
})
