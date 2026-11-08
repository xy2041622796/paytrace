import { createApp } from 'vue'
import { createPinia } from 'pinia'
import {
  NConfigProvider, NMessageProvider, NDialogProvider,
  NAlert, NButton, NCard, NCollapse, NCollapseItem,
  NDataTable, NDatePicker, NDivider, NForm, NFormItem,
  NInput, NInputNumber, NRadioButton, NRadioGroup,
  NSelect, NSlider, NSwitch, NTabPane, NTabs
} from 'naive-ui'
import App from './App.vue'
import router from './router'
import { useAuthStore } from './stores/auth'
import { useThemeStore } from './stores/theme'
import { useAppStore } from './stores/app'
import AppIcon from './components/AppIcon.vue'
import PageHeader from './components/PageHeader.vue'
import SectionCard from './components/SectionCard.vue'
import StatCard from './components/StatCard.vue'
import StatusChip from './components/StatusChip.vue'
import EmptyState from './components/EmptyState.vue'
import './styles/theme.css'

const app = createApp(App)

// 按需注册：这份清单由 npm run verify 静态扫描比对，
// 模板里新增任何 n- 组件却没注册，测试会直接失败，不会静默不渲染。
const components = {
  NConfigProvider, NMessageProvider, NDialogProvider,
  NAlert, NButton, NCard, NCollapse, NCollapseItem,
  NDataTable, NDatePicker, NDivider, NForm, NFormItem,
  NInput, NInputNumber, NRadioButton, NRadioGroup,
  NSelect, NSlider, NSwitch, NTabPane, NTabs
}
Object.entries(components).forEach(([name, component]) => app.component(name, component))

// 全局复用的设计系统组件：所有页面无需 import 即可使用，保证跨页一致
const sharedComponents = { AppIcon, PageHeader, SectionCard, StatCard, StatusChip, EmptyState }
Object.entries(sharedComponents).forEach(([name, component]) => app.component(name, component))

// 组件解析失败、运行时异常都不静默，同时留给自动化冒烟检查
// 写入 window.__appErrors / __missingComponents 的逻辑保持不变（自动化检查依赖它）；
// 额外派发事件，供 App.vue 的全局错误展示入口即时刷新。
app.config.warnHandler = (msg) => {
  if (String(msg).includes('Failed to resolve component')) {
    window.__missingComponents = (window.__missingComponents || []).concat(String(msg))
    console.error('[组件未注册]', msg)
    window.dispatchEvent(new CustomEvent('paytrace:error-collected'))
  }
}
app.config.errorHandler = (err, _instance, info) => {
  window.__appErrors = (window.__appErrors || []).concat(String(err?.message || err))
  console.error('[页面异常]', info, err)
  window.dispatchEvent(new CustomEvent('paytrace:error-collected'))
}

app.use(createPinia())
useThemeStore().init() // mount 前定主题，避免首屏闪白
// 注册后端适配器：当前余额 / 每月固定还款 / 年内历史薪资 改为 Supabase 权威存储
useAppStore().registerPrefsAdapter()
app.use(router)
app.mount('#app')

// 启动即初始化登录态（幂等，仅首次真正拉取）
useAuthStore().ensureReady()
