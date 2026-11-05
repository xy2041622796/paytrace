<template>
  <div class="layout">
    <!-- 桌面侧边栏 -->
    <aside class="sidebar">
      <div class="brand">
        <span class="dot" />
        现金流安全垫
      </div>
      <nav class="nav">
        <router-link
          v-for="item in menus"
          :key="item.to"
          :to="item.to"
          class="nav-item"
          active-class="nav-active"
        >
          {{ item.label }}
        </router-link>
      </nav>
      <div class="sidebar-foot">
        <div class="theme-row">
          <span class="theme-label">{{ theme.isDark ? '深色模式' : '浅色模式' }}</span>
          <n-switch size="small" :value="theme.isDark" @update:value="onThemeChange" />
        </div>
        <div class="theme-row">
          <span class="theme-label">金额打码</span>
          <n-switch size="small" :value="privacyOn" @update:value="onPrivacyChange" />
        </div>
        <div class="user">{{ auth.username || '未登录' }}</div>
        <router-link to="/check" class="side-link">导出全部数据</router-link>
        <button class="side-link as-button" @click="showDeleteInfo = !showDeleteInfo">注销账户</button>
        <div v-if="showDeleteInfo" class="delete-info">
          当前版本不提供账户删除。真正的账户注销需要删除 Supabase 的
          <code>auth.users</code> 记录，该操作必须使用服务端管理密钥（service_role）
          或服务端函数（Edge Function）调用管理端接口；前端使用的是公开 anon key 且受 RLS 限制，
          无法执行，也不会假装已经删除。如需注销，请在 Supabase 控制台由管理员操作，或联系产品维护者。
        </div>
        <button class="logout" @click="logout">退出登录</button>
      </div>
    </aside>

    <!-- 移动端顶栏 -->
    <header class="mobile-top">
      <div class="brand"><span class="dot" />现金流安全垫</div>
      <div class="mobile-actions">
        <span class="theme-label">{{ theme.isDark ? '夜间' : '日间' }}</span>
        <n-switch size="small" :value="theme.isDark" @update:value="onThemeChange" />
        <button class="logout mini" @click="togglePrivacyMobile">{{ privacyOn ? '取消打码' : '金额打码' }}</button>
        <button class="logout" @click="logout">退出</button>
      </div>
    </header>

    <!-- 主内容区 -->
    <main class="content">
      <router-view />
    </main>

    <!-- 移动端底部导航 -->
    <nav class="mobile-nav">
      <router-link
        v-for="item in menus"
        :key="item.to"
        :to="item.to"
        class="mobile-nav-item"
        active-class="nav-active"
      >
        {{ item.short }}
      </router-link>
    </nav>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { useThemeStore } from '../stores/theme'
import { readPrivacyMask, writePrivacyMask, invalidatePrivacyMask } from '../lib/privacy'

const router = useRouter()
const auth = useAuthStore()
const theme = useThemeStore()
const privacyOn = ref(readPrivacyMask())
const showDeleteInfo = ref(false)
const menus = [
  { to: '/dashboard', label: '现金流仪表盘', short: '仪表盘' },
  { to: '/calendar', label: '现金流日历', short: '日历' },
  { to: '/ai-note', label: '智能记账', short: '记账' },
  { to: '/ledger', label: '流水账本', short: '流水' },
  { to: '/settings', label: '档案配置', short: '档案' },
  { to: '/check', label: '数据体检', short: '体检' },
  { to: '/todo', label: '待办事项', short: '待办' }
]

const onThemeChange = (v) => theme.setMode(v ? 'dark' : 'light')

function onPrivacyChange(v) {
  writePrivacyMask(v)
  privacyOn.value = v
  // 通知其它页面即时重算（其它页面监听 paytrace:pref-changed 后重新调用 formatMoney）
  window.dispatchEvent(new CustomEvent('paytrace:pref-changed', { detail: { key: 'privacyMask' } }))
}

function togglePrivacyMobile() {
  onPrivacyChange(!privacyOn.value)
}

function syncPrivacy() {
  invalidatePrivacyMask()
  privacyOn.value = readPrivacyMask()
}

function onPrefChanged(e) {
  if (e?.detail?.key === 'privacyMask' || e?.detail?.key === '*') syncPrivacy()
}

function onStorage(e) {
  // 偏好已按账号分域：key 形如 paytrace:pref:<uid>:privacyMask
  if (e?.key == null ||
      (e.key.startsWith('paytrace:pref:') && e.key.endsWith('privacyMask')) ||
      e.key === 'paytrace:pref-scope') syncPrivacy()
}

async function logout() {
  await auth.logout()
  router.replace('/login')
}

// 确保登录态已就绪（侧边栏用户名依赖 auth.username getter）
onMounted(() => {
  auth.ensureReady()
  window.addEventListener('paytrace:pref-changed', onPrefChanged)
  window.addEventListener('storage', onStorage)
})
onBeforeUnmount(() => {
  window.removeEventListener('paytrace:pref-changed', onPrefChanged)
  window.removeEventListener('storage', onStorage)
})
</script>

<style scoped>
.layout { display: flex; height: 100vh; background: var(--c-bg); }
.sidebar {
  width: 220px;
  border-right: 1px solid var(--c-border);
  padding: 20px 14px;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}
.brand {
  font-size: 16px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px 18px;
}
.dot { width: 10px; height: 10px; border-radius: 50%; background: var(--c-primary); flex-shrink: 0; }
.nav { flex: 1; display: flex; flex-direction: column; gap: 4px; }
.nav-item {
  position: relative;
  text-decoration: none;
  color: var(--c-text-2);
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  font-size: 14px;
  transition: background .15s, color .15s, transform var(--dur-fast) var(--ease-out);
}
.nav-item:hover { background: var(--c-hover); color: var(--c-text); transform: translateX(2px); }
.nav-active { background: var(--c-primary-soft); color: var(--c-primary); font-weight: 600; }
/* 激活指示条：位置固定，只用 scaleY 做进出，不动画 width / left */
.nav-item::before {
  content: '';
  position: absolute;
  left: 0; top: 20%; bottom: 20%;
  width: 3px;
  border-radius: 2px;
  background: var(--c-primary);
  transform: scaleY(0);
  transition: transform var(--dur-base) var(--ease-out);
}
.nav-item.nav-active::before { transform: scaleY(1); }
.sidebar-foot { border-top: 1px solid var(--c-border); padding-top: 14px; }
.theme-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.theme-label { font-size: 12px; color: var(--c-text-2); }
.user { font-size: 12px; color: var(--c-text-3); margin-bottom: 8px; word-break: break-all; }
.side-link {
  display: block;
  width: 100%;
  box-sizing: border-box;
  text-align: center;
  text-decoration: none;
  background: var(--c-surface);
  border: 1px solid var(--c-border);
  border-radius: var(--radius-sm);
  padding: 8px;
  margin-bottom: 8px;
  cursor: pointer;
  color: var(--c-text-2);
  font-size: 13px;
}
.side-link:hover { border-color: var(--c-primary); color: var(--c-primary); }
.as-button { font-family: inherit; }
.delete-info {
  font-size: 12px;
  line-height: 1.7;
  color: var(--c-text-2);
  background: var(--c-hover);
  border-radius: var(--radius-sm);
  padding: 10px;
  margin-bottom: 8px;
  animation: side-reveal var(--dur-base) var(--ease-out) backwards;
}
@keyframes side-reveal {
  from { opacity: 0; transform: translateY(-6px); }
  to   { opacity: 1; transform: translateY(0); }
}
.delete-info code { font-size: 11px; word-break: break-all; }
.logout {
  width: 100%;
  background: var(--c-surface);
  border: 1px solid var(--c-border);
  border-radius: var(--radius-sm);
  padding: 8px;
  cursor: pointer;
  color: var(--c-text-2);
  font-size: 13px;
}
.logout:hover { border-color: var(--c-danger); color: var(--c-danger); }
.content { flex: 1; overflow-y: auto; padding: 28px 32px; min-width: 0; }

.mobile-top, .mobile-nav { display: none; }

@media (max-width: 768px) {
  .layout { flex-direction: column; height: 100vh; height: 100dvh; }
  .sidebar { display: none; }
  .mobile-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 10px 14px;
    border-bottom: 1px solid var(--c-border);
    background: var(--c-surface);
    flex-shrink: 0;
  }
  .mobile-top .brand { padding: 0; font-size: 15px; }
  .mobile-actions { display: flex; align-items: center; gap: 8px; }
  .mobile-actions .logout { width: auto; padding: 5px 10px; }
  .mobile-actions .mini { font-size: 12px; padding: 5px 8px; }
  .content { padding: 16px 14px 84px; }
  .mobile-nav {
    display: flex;
    position: fixed;
    left: 0; right: 0; bottom: 0;
    min-height: 58px;
    padding-bottom: env(safe-area-inset-bottom);
    background: var(--c-surface);
    border-top: 1px solid var(--c-border);
    z-index: 20;
  }
  .mobile-nav-item {
    position: relative;
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    text-decoration: none;
    color: var(--c-text-2);
    font-size: 13px;
    transition: color var(--dur-fast) ease, background-color var(--dur-fast) ease;
  }
  .mobile-nav-item.nav-active { color: var(--c-primary); background: var(--c-primary-soft); font-weight: 600; }
  /* 激活小圆点：只做 scale，不产生位移抖动 */
  .mobile-nav-item::after {
    content: '';
    position: absolute;
    bottom: 6px;
    width: 4px; height: 4px;
    border-radius: 50%;
    background: var(--c-primary);
    transform: scale(0);
    transition: transform var(--dur-base) var(--ease-out);
  }
  .mobile-nav-item.nav-active::after { transform: scale(1); }
}
</style>
