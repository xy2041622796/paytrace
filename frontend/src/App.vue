<template>
  <n-config-provider :theme="naiveTheme" :theme-overrides="themeOverrides" :locale="zhCN" :date-locale="dateZhCN">
    <n-message-provider>
      <n-dialog-provider>
        <!-- 登录 ↔ 主界面切换；不设 key，子路由切换时复用 AppLayout 不重播整页 -->
        <router-view v-slot="{ Component }">
          <transition name="auth-page" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </n-dialog-provider>
    </n-message-provider>

    <!-- 首屏 auth 未就绪：加载骨架屏（纯展示，不阻塞路由守卫） -->
    <div v-if="auth.loading" class="boot-skeleton" role="status" aria-live="polite">
      <div class="boot-card">
        <div class="boot-brand"><span class="boot-dot" />现金流安全垫</div>
        <div class="boot-line w-60" />
        <div class="boot-line w-90" />
        <div class="boot-line w-75" />
        <div class="boot-block" />
        <div class="boot-tip">正在载入登录态与档案数据…</div>
      </div>
    </div>

    <!-- 全局错误收集：只在真的出现异常时出现，不占用正常界面的视觉空间 -->
    <button
      v-if="errorTotal > 0"
      class="err-entry has-error"
      @click="showErrors = !showErrors"
    >
      运行诊断（{{ errorTotal }}）
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

// 统一覆盖 Naive UI 主题：主色与 theme.css 的 --c-primary 严格对齐
// 深色下提亮主色保证对比度，并让组件底色与 --c-bg / --c-surface 对齐
const themeOverrides = computed(() => ({
  common: {
    ...(theme.isDark
      ? {
          primaryColor: '#FF8A5C',
          primaryColorHover: '#FFA47C',
          primaryColorPressed: '#EC7143',
          primaryColorSuppl: '#FF8A5C',
          bodyColor: '#0E1218',
          cardColor: '#171D26',
          popoverColor: '#1C232E',
          borderColor: '#29323F',
          inputColor: '#1C232E'
        }
      : {
          primaryColor: '#EA6234',
          primaryColorHover: '#F47A4C',
          primaryColorPressed: '#CE4E24',
          primaryColorSuppl: '#F47A4C',
          borderColor: '#E4E9F0',
          inputColor: '#FFFFFF'
        }),
    borderRadius: '8px',
    fontSize: '14px',
    lineHeight: '1.65'
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
  width: min(380px, 86vw);
  padding: 28px;
  border: 1px solid var(--c-border);
  border-radius: var(--radius-lg);
  background: var(--c-surface);
  box-shadow: var(--shadow-md);
  animation: boot-pop var(--dur-slow) var(--ease-out) both;
}
.boot-brand {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 17px;
  font-weight: 700;
  margin-bottom: 20px;
  color: var(--c-text);
}
.boot-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--c-primary);
  box-shadow: 0 0 0 4px var(--c-primary-soft);
}
/* shimmer 用伪元素 transform 位移，不动画布局属性（避免持续重绘） */
.boot-line, .boot-block {
  position: relative;
  overflow: hidden;
  border-radius: var(--r-sm);
  background: var(--c-surface-3);
}
.boot-line::after, .boot-block::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, transparent, var(--c-border), transparent);
  transform: translateX(-100%);
  animation: boot-sweep 1.4s var(--ease-in-out) infinite;
}
.boot-line { height: 12px; margin-bottom: 12px; }
.boot-block { height: 96px; border-radius: var(--r-md); margin: 8px 0 16px; }
.w-60 { width: 60%; }
.w-75 { width: 75%; }
.w-90 { width: 90%; }
.boot-tip {
  font-size: 13px;
  color: var(--c-text-2);
  text-align: center;
  animation: boot-fade var(--dur-slow) linear both;
}
@keyframes boot-sweep { to { transform: translateX(100%); } }
@keyframes boot-pop {
  from { opacity: 0; transform: scale(.97) translateY(8px); }
  to   { opacity: 1; transform: scale(1) translateY(0); }
}
@keyframes boot-fade { from { opacity: 0; } to { opacity: 1; } }

.err-entry {
  position: fixed;
  right: 14px;
  bottom: 72px;
  z-index: 90;
  font-size: 12px;
  padding: 6px 12px;
  border: 1px solid var(--c-danger);
  border-radius: 999px;
  background: var(--c-danger-soft);
  color: var(--c-danger);
  cursor: pointer;
  animation: boot-alert 1.8s var(--ease-in-out) 2;
}
@keyframes boot-alert { 50% { transform: scale(1.06); } }
.err-panel {
  animation: boot-pop var(--dur-base) var(--ease-out) both;
  position: fixed;
  right: 14px;
  bottom: 112px;
  z-index: 91;
  width: min(360px, 86vw);
  max-height: 60vh;
  overflow-y: auto;
  padding: 14px;
  border: 1px solid var(--c-border);
  border-radius: var(--radius);
  background: var(--c-surface);
  box-shadow: var(--shadow-lg);
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
  border-radius: var(--r-xs);
  background: var(--c-hover);
  word-break: break-word;
}
</style>
