<template>
  <n-config-provider :theme="naiveTheme" :theme-overrides="themeOverrides" :locale="zhCN" :date-locale="dateZhCN">
    <n-message-provider>
      <n-dialog-provider>
        <router-view />
      </n-dialog-provider>
    </n-message-provider>

    <!-- 首屏 auth 未就绪：加载骨架屏（纯展示，不阻塞路由守卫） -->
    <div v-if="auth.loading" class="boot-skeleton" role="status" aria-live="polite">
      <div class="boot-card">
        <div class="boot-brand">现金流安全垫</div>
        <div class="boot-line w-60" />
        <div class="boot-line w-90" />
        <div class="boot-line w-75" />
        <div class="boot-block" />
        <div class="boot-tip">正在载入登录态与档案数据…</div>
      </div>
    </div>

    <!-- 全局错误收集展示入口 -->
    <button
      class="err-entry"
      :class="{ 'has-error': errorTotal > 0 }"
      @click="showErrors = !showErrors"
    >
      运行诊断{{ errorTotal > 0 ? '（' + errorTotal + '）' : '' }}
    </button>
    <div v-if="showErrors" class="err-panel">
      <div class="err-panel-head">
        <b>运行诊断</b>
        <button class="err-close" @click="showErrors = false">关闭</button>
      </div>
      <p class="err-hint">页面异常与组件解析失败会被自动收集，供排查使用；不影响业务数据。</p>
      <div v-if="!errorTotal" class="err-empty">暂无异常记录。</div>
      <template v-else>
        <div v-if="appErrors.length" class="err-group">
          <div class="err-group-title">页面异常（{{ appErrors.length }}）</div>
          <div v-for="(item, i) in appErrors" :key="'e' + i" class="err-item">{{ item }}</div>
        </div>
        <div v-if="missingComponents.length" class="err-group">
          <div class="err-group-title">组件解析失败（{{ missingComponents.length }}）</div>
          <div v-for="(item, i) in missingComponents" :key="'m' + i" class="err-item">{{ item }}</div>
        </div>
      </template>
    </div>
  </n-config-provider>
</template>

<script setup>
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'
import {
  darkTheme, NConfigProvider, NMessageProvider, NDialogProvider,
  zhCN, dateZhCN
} from 'naive-ui'
import { useThemeStore } from './stores/theme'
import { useAuthStore } from './stores/auth'

const theme = useThemeStore()
const auth = useAuthStore()
const naiveTheme = computed(() => (theme.isDark ? darkTheme : null))

// 统一覆盖 Naive UI 主题：主色橙，圆角 8px
// 深色下提亮主色保证对比度，并让组件底色与 --c-bg / --c-surface 对齐
const themeOverrides = computed(() => ({
  common: {
    ...(theme.isDark
      ? {
          primaryColor: '#FF8457',
          primaryColorHover: '#FF9B75',
          primaryColorPressed: '#E8703F',
          primaryColorSuppl: '#FF8457',
          bodyColor: '#14171C',
          cardColor: '#1D2129',
          popoverColor: '#1D2129'
        }
      : {
          primaryColor: '#FF6B35',
          primaryColorHover: '#FF8554',
          primaryColorPressed: '#E85A28',
          primaryColorSuppl: '#FF8554',
          borderColor: '#E5E7EB'
        }),
    borderRadius: '8px',
    fontSize: '14px'
  }
}))

// 全局错误收集展示入口：只读 window.__appErrors / __missingComponents，
// 写入仍由 main.js 的 errorHandler / warnHandler 负责，不破坏自动化检查。
const appErrors = ref([])
const missingComponents = ref([])
const showErrors = ref(false)
const errorTotal = computed(() => appErrors.value.length + missingComponents.value.length)

function collectErrors() {
  appErrors.value = Array.isArray(window.__appErrors) ? [...window.__appErrors] : []
  missingComponents.value = Array.isArray(window.__missingComponents) ? [...window.__missingComponents] : []
}

onMounted(() => {
  collectErrors()
  window.addEventListener('paytrace:error-collected', collectErrors)
})
onBeforeUnmount(() => {
  window.removeEventListener('paytrace:error-collected', collectErrors)
})
</script>

<style scoped>
.boot-skeleton {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--c-bg);
}
.boot-card {
  width: min(360px, 86vw);
  padding: 24px;
  border: 1px solid var(--c-border);
  border-radius: 12px;
  background: var(--c-surface);
}
.boot-brand { font-size: 16px; font-weight: 600; margin-bottom: 18px; }
.boot-line, .boot-block {
  border-radius: 6px;
  background: linear-gradient(90deg, var(--c-hover) 25%, var(--c-border) 37%, var(--c-hover) 63%);
  background-size: 400% 100%;
  animation: boot-shimmer 1.4s ease infinite;
}
.boot-line { height: 12px; margin-bottom: 12px; }
.boot-block { height: 96px; border-radius: 8px; margin: 8px 0 16px; }
.w-60 { width: 60%; }
.w-75 { width: 75%; }
.w-90 { width: 90%; }
.boot-tip { font-size: 13px; color: var(--c-text-2); text-align: center; }
@keyframes boot-shimmer {
  0% { background-position: 100% 50%; }
  100% { background-position: 0 50%; }
}

.err-entry {
  position: fixed;
  right: 14px;
  bottom: 72px;
  z-index: 90;
  font-size: 12px;
  padding: 6px 10px;
  border: 1px solid var(--c-border);
  border-radius: 999px;
  background: var(--c-surface);
  color: var(--c-text-2);
  cursor: pointer;
}
.err-entry.has-error { color: var(--c-danger); border-color: var(--c-danger); }
.err-panel {
  position: fixed;
  right: 14px;
  bottom: 112px;
  z-index: 91;
  width: min(360px, 86vw);
  max-height: 60vh;
  overflow-y: auto;
  padding: 14px;
  border: 1px solid var(--c-border);
  border-radius: 10px;
  background: var(--c-surface);
}
.err-panel-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.err-close {
  border: none;
  background: transparent;
  color: var(--c-text-2);
  cursor: pointer;
  font-size: 12px;
}
.err-hint { font-size: 12px; color: var(--c-text-2); line-height: 1.6; margin: 8px 0; }
.err-empty { font-size: 13px; color: var(--c-text-2); padding: 8px 0; }
.err-group { margin-top: 10px; }
.err-group-title { font-size: 12px; font-weight: 600; margin-bottom: 6px; }
.err-item {
  font-size: 12px;
  color: var(--c-text-2);
  line-height: 1.6;
  padding: 6px 8px;
  margin-bottom: 4px;
  border-radius: 4px;
  background: var(--c-hover);
  word-break: break-word;
}
</style>
