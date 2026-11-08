<template>
  <div class="layout">
    <!-- 桌面侧边栏：分组导航 + 用户卡 + 偏好开关 -->
    <aside class="sidebar">
      <div class="brand">
        <span class="brand-mark"><AppIcon name="trend" :size="19" /></span>
        <span class="brand-text">
          <b>现金流安全垫</b>
          <small>把每一笔钱看在前面</small>
        </span>
      </div>

      <div v-if="isDemoMode" class="demo-badge">
        <AppIcon name="info" :size="13" /> 演示模式 · 数据仅存本机
      </div>

      <nav class="nav" aria-label="主导航">
        <div v-for="group in menuGroups" :key="group.title" class="nav-group">
          <div class="nav-group-title">{{ group.title }}</div>
          <router-link
            v-for="item in group.items"
            :key="item.to"
            :to="item.to"
            class="nav-item"
            active-class="nav-active"
          >
            <AppIcon :name="item.icon" :size="17" />
            <span>{{ item.label }}</span>
            <span v-if="item.to === currentPath" class="nav-current" aria-hidden="true" />
          </router-link>
        </div>
      </nav>

      <div class="sidebar-foot">
        <div class="user-card">
          <span class="avatar">{{ (auth.username || '我').slice(0, 1).toUpperCase() }}</span>
          <span class="user-meta">
            <b>{{ auth.username || '未登录' }}</b>
            <small>个人账本</small>
          </span>
        </div>

        <div class="pref-row">
          <span class="pref-label"><AppIcon :name="theme.isDark ? 'moon' : 'sun'" :size="15" />{{ theme.isDark ? '深色模式' : '浅色模式' }}</span>
          <n-switch size="small" :value="theme.isDark" @update:value="onThemeChange" />
        </div>
        <div class="pref-row">
          <span class="pref-label"><AppIcon :name="privacyOn ? 'eyeOff' : 'eye'" :size="15" />金额打码</span>
          <n-switch size="small" :value="privacyOn" @update:value="onPrivacyChange" />
        </div>

        <router-link to="/check" class="side-link"><AppIcon name="download" :size="15" />导出全部数据</router-link>
        <p class="side-note">账户注销：当前版本不提供自助注销。如需删除账户与数据，请在 Supabase 控制台操作或联系维护者。</p>
        <button class="logout" @click="logout"><AppIcon name="logout" :size="15" />退出登录</button>
      </div>
    </aside>

    <!-- 移动端顶栏：品牌 + 当前页 + 图标化快捷操作 -->
    <header class="mobile-top">
      <div class="brand compact">
        <span class="brand-mark"><AppIcon name="trend" :size="17" /></span>
        <span class="brand-text"><b>现金流安全垫</b></span>
      </div>
      <div class="mobile-actions">
        <button class="icon-btn" :aria-label="theme.isDark ? '切换浅色' : '切换深色'" @click="onThemeChange(!theme.isDark)">
          <AppIcon :name="theme.isDark ? 'sun' : 'moon'" :size="17" />
        </button>
        <button class="icon-btn" :aria-label="privacyOn ? '取消金额打码' : '金额打码'" @click="togglePrivacyMobile">
          <AppIcon :name="privacyOn ? 'eye' : 'eyeOff'" :size="17" />
        </button>
        <button class="icon-btn" aria-label="退出登录" @click="logout">
          <AppIcon name="logout" :size="17" />
        </button>
      </div>
    </header>

    <div class="mobile-context">
      <span class="pt-eyebrow">{{ currentGroup }}</span>
      <strong>{{ currentTitle }}</strong>
    </div>

    <!-- 主内容区 -->
    <main class="content">
      <router-view />
    </main>

    <!-- 移动端底部导航：4 个高频入口 + 「更多」聚合，避免 7 项挤在 375px -->
    <nav class="mobile-nav" aria-label="移动端主导航">
      <router-link
        v-for="item in mobileMenus"
        :key="item.to"
        :to="item.to"
        class="mobile-nav-item"
        active-class="nav-active"
      >
        <AppIcon :name="item.icon" :size="19" />
        <span>{{ item.short }}</span>
      </router-link>
      <button class="mobile-nav-item as-button" :class="{ 'nav-active': moreOpen }" @click="moreOpen = !moreOpen">
        <AppIcon name="filter" :size="19" />
        <span>更多</span>
      </button>
    </nav>

    <!-- 更多面板：完整入口 + 偏好与账户操作，任何页面都不会被藏起来 -->
    <div v-if="moreOpen" class="more-mask" @click="moreOpen = false" />
    <div v-if="moreOpen" class="more-sheet">
      <div class="more-head">
        <b>全部功能</b>
        <button class="icon-btn" aria-label="关闭" @click="moreOpen = false"><AppIcon name="close" :size="16" /></button>
      </div>
      <div class="more-grid">
        <router-link v-for="item in allMenus" :key="item.to" :to="item.to" class="more-item" @click="moreOpen = false">
          <span class="more-ico"><AppIcon :name="item.icon" :size="18" /></span>
          <span>{{ item.label }}</span>
        </router-link>
      </div>
      <div class="more-divider" />
      <div class="more-utils">
        <button class="pt-btn" @click="onThemeChange(!theme.isDark); moreOpen = false">
          <AppIcon :name="theme.isDark ? 'sun' : 'moon'" :size="15" />{{ theme.isDark ? '切换浅色' : '切换深色' }}
        </button>
        <button class="pt-btn" @click="togglePrivacyMobile(); moreOpen = false">
          <AppIcon :name="privacyOn ? 'eye' : 'eyeOff'" :size="15" />{{ privacyOn ? '取消打码' : '金额打码' }}
        </button>
        <router-link to="/check" class="pt-btn" @click="moreOpen = false"><AppIcon name="download" :size="15" />导出全部数据</router-link>
        <button class="pt-btn pt-btn--danger" @click="logout(); moreOpen = false"><AppIcon name="logout" :size="15" />退出登录</button>
      </div>
    </div>

  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { useThemeStore } from '../stores/theme'
import { readPrivacyMask, writePrivacyMask, invalidatePrivacyMask } from '../lib/privacy'
import { isDemoMode } from '../lib/supabase'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()
const theme = useThemeStore()
const privacyOn = ref(readPrivacyMask())
const moreOpen = ref(false)

// 导航唯一数据源：分组、图标、短标签三处共用，避免桌面/移动两份清单漂移
const menuGroups = [
  {
    title: '看现金流',
    items: [
      { to: '/dashboard', label: '现金流仪表盘', short: '仪表盘', icon: 'dashboard' },
      { to: '/calendar', label: '现金流日历', short: '日历', icon: 'calendar' }
    ]
  },
  {
    title: '记一笔',
    items: [
      { to: '/ai-note', label: '智能记账', short: '记账', icon: 'sparkles' },
      { to: '/ledger', label: '流水账本', short: '流水', icon: 'book' }
    ]
  },
  {
    title: '管数据',
    items: [
      { to: '/settings', label: '档案配置', short: '档案', icon: 'settings' },
      { to: '/todo', label: '待办事项', short: '待办', icon: 'listCheck' },
      { to: '/check', label: '数据体检', short: '体检', icon: 'shieldCheck' }
    ]
  }
]
const allMenus = computed(() => menuGroups.flatMap((g) => g.items))
const mobileMenus = computed(() => allMenus.value.slice(0, 4))
const currentPath = computed(() => route.path)
const currentItem = computed(() => allMenus.value.find((m) => m.to === route.path) || allMenus.value[0])
const currentTitle = computed(() => currentItem.value?.label || '现金流安全垫')
const currentGroup = computed(() => menuGroups.find((g) => g.items.some((i) => i.to === route.path))?.title || '总览')

watch(() => route.fullPath, () => { moreOpen.value = false })

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

/* ---------- 桌面侧边栏 ---------- */
.sidebar {
  width: 244px;
  border-right: 1px solid var(--c-border);
  padding: 22px 16px 18px;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  background: var(--c-surface);
  overflow-y: auto;
}
.brand { display: flex; align-items: center; gap: 11px; padding: 2px 6px 20px; }
.brand.compact { padding: 0; }
.brand-mark {
  width: 36px; height: 36px;
  display: inline-flex; align-items: center; justify-content: center;
  border-radius: 11px;
  background: var(--c-primary);
  color: #fff;
  box-shadow: 0 4px 12px rgba(234, 98, 52, .28);
  flex: none;
}
.brand-text { display: flex; flex-direction: column; line-height: 1.3; min-width: 0; }
.brand-text b { font-size: 15px; font-weight: 750; color: var(--c-text); letter-spacing: -.01em; }
.brand-text small { font-size: 11px; color: var(--c-text-3); margin-top: 2px; }

.demo-badge {
  display: flex; align-items: center; gap: 6px;
  font-size: 11px; font-weight: 600;
  color: var(--c-primary-ink);
  background: var(--c-primary-soft);
  border: 1px solid var(--c-primary-soft-2);
  border-radius: var(--r-pill);
  padding: 5px 10px;
  margin: 0 4px 18px;
}

.nav { flex: 1; display: flex; flex-direction: column; gap: 18px; }
.nav-group-title {
  font-size: 10px;
  font-weight: 800;
  letter-spacing: .14em;
  color: var(--c-text-3);
  padding: 0 12px 7px;
  text-transform: uppercase;
}
.nav-group { display: flex; flex-direction: column; gap: 3px; }
.nav-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 11px;
  text-decoration: none;
  color: var(--c-text-2);
  padding: 9px 12px;
  border-radius: var(--r-sm);
  font-size: 13.5px;
  font-weight: 550;
  transition: background var(--dur-fast) ease, color var(--dur-fast) ease, transform var(--dur-fast) var(--ease-out);
}
.nav-item:hover { background: var(--c-hover); color: var(--c-text); transform: translateX(2px); }
.nav-active { background: var(--c-primary-soft); color: var(--c-primary-ink); font-weight: 700; }
[data-theme='dark'] .nav-active { color: var(--c-primary); }
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
.nav-current { margin-left: auto; width: 5px; height: 5px; border-radius: 50%; background: var(--c-primary); }

.sidebar-foot { border-top: 1px solid var(--c-border); padding-top: 14px; }
.user-card {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 11px;
  margin-bottom: 12px;
  border: 1px solid var(--c-border);
  border-radius: var(--r-md);
  background: var(--c-surface-2);
}
.avatar {
  width: 32px; height: 32px; flex: none;
  display: inline-flex; align-items: center; justify-content: center;
  border-radius: 50%;
  background: var(--c-primary-soft);
  color: var(--c-primary-ink);
  font-size: 14px; font-weight: 750;
}
.user-meta { display: flex; flex-direction: column; line-height: 1.35; min-width: 0; }
.user-meta b { font-size: 13px; color: var(--c-text); word-break: break-all; }
.user-meta small { font-size: 11px; color: var(--c-text-3); }

.pref-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 10px; padding: 0 2px; }
.pref-label { display: inline-flex; align-items: center; gap: 8px; font-size: 12.5px; color: var(--c-text-2); }
.side-link, .logout {
  display: flex; align-items: center; justify-content: center; gap: 8px;
  width: 100%;
  box-sizing: border-box;
  text-align: center;
  text-decoration: none;
  background: var(--c-surface);
  border: 1px solid var(--c-border);
  border-radius: var(--r-sm);
  padding: 8px;
  margin-bottom: 8px;
  cursor: pointer;
  color: var(--c-text-2);
  font-size: 12.5px;
  font-family: inherit;
}
.side-link:hover { border-color: var(--c-primary); color: var(--c-primary); }
.delete-info {
  font-size: 11.5px;
  line-height: 1.7;
  color: var(--c-text-2);
  background: var(--c-surface-3);
  border: 1px solid var(--c-border);
  border-radius: var(--r-sm);
  padding: 10px;
  margin-bottom: 8px;
  animation: side-reveal var(--dur-base) var(--ease-out) backwards;
}
@keyframes side-reveal {
  from { opacity: 0; transform: translateY(-6px); }
  to   { opacity: 1; transform: translateY(0); }
}
.delete-info code { font-size: 11px; word-break: break-all; }
.logout:hover { border-color: var(--c-danger); color: var(--c-danger); }
.side-note { font-size: 11px; line-height: 1.6; color: var(--c-text-2); margin: 12px 2px 0; }

.content {
  flex: 1; overflow-y: auto; padding: 30px 36px 56px; min-width: 0;
  background-image: radial-gradient(circle at 86% -12%, var(--c-primary-soft) 0%, transparent 42%);
}

.mobile-top, .mobile-nav, .mobile-context, .more-mask, .more-sheet { display: none; }

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
  .mobile-top .brand-mark { width: 30px; height: 30px; border-radius: 9px; }
  .mobile-actions { display: flex; align-items: center; gap: 6px; }
  .icon-btn {
    width: 32px; height: 32px;
    display: inline-flex; align-items: center; justify-content: center;
    border: 1px solid var(--c-border);
    border-radius: var(--r-sm);
    background: var(--c-surface-2);
    color: var(--c-text-2);
    cursor: pointer;
    padding: 0;
  }
  .icon-btn:hover { border-color: var(--c-primary); color: var(--c-primary); }
  .mobile-context {
    display: flex; align-items: center; gap: 10px;
    padding: 8px 16px 2px;
    background: var(--c-bg);
    flex-shrink: 0;
  }
  .mobile-context .pt-eyebrow { margin: 0; }
  .mobile-context strong { font-size: 12px; color: var(--c-text-2); font-weight: 600; }
  .content { padding: 12px 14px 96px; }

  .mobile-nav {
    display: flex;
    position: fixed;
    left: 0; right: 0; bottom: 0;
    min-height: 62px;
    padding-bottom: env(safe-area-inset-bottom);
    background: var(--c-surface);
    border-top: 1px solid var(--c-border);
    box-shadow: 0 -4px 16px rgba(23, 33, 47, .05);
    z-index: 30;
  }
  .mobile-nav-item {
    position: relative;
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 3px;
    text-decoration: none;
    color: var(--c-text-3);
    font-size: 10.5px;
    font-weight: 600;
    border: none;
    background: transparent;
    font-family: inherit;
    cursor: pointer;
    transition: color var(--dur-fast) ease, background-color var(--dur-fast) ease;
  }
  .mobile-nav-item.nav-active { color: var(--c-primary); background: var(--c-primary-soft); }
  .mobile-nav-item.as-button { padding: 0; }
  .mobile-nav-item::after {
    content: '';
    position: absolute;
    bottom: 5px;
    width: 4px; height: 4px;
    border-radius: 50%;
    background: var(--c-primary);
    transform: scale(0);
    transition: transform var(--dur-base) var(--ease-out);
  }
  .mobile-nav-item.nav-active::after { transform: scale(1); }

  .more-mask {
    display: block;
    position: fixed; inset: 0;
    background: rgba(11, 16, 24, .42);
    z-index: 40;
    animation: more-fade var(--dur-fast) var(--ease-out) backwards;
  }
  .more-sheet {
    display: block;
    position: fixed;
    left: 0; right: 0; bottom: 0;
    z-index: 41;
    padding: 18px 16px calc(20px + env(safe-area-inset-bottom));
    background: var(--c-surface);
    border-radius: var(--radius-lg) var(--radius-lg) 0 0;
    box-shadow: var(--shadow-lg);
    animation: more-rise var(--dur-base) var(--ease-out) backwards;
  }
  @keyframes more-fade { from { opacity: 0; } to { opacity: 1; } }
  @keyframes more-rise {
    from { opacity: 0; transform: translateY(14px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .more-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
  .more-head b { font-size: 15px; }
  .more-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
  .more-item {
    display: flex; flex-direction: column; align-items: center; gap: 7px;
    padding: 12px 4px;
    border-radius: var(--r-md);
    background: var(--c-surface-2);
    border: 1px solid var(--c-border);
    color: var(--c-text-2);
    text-decoration: none;
    font-size: 11px;
    font-weight: 600;
    text-align: center;
  }
  .more-item:hover { border-color: var(--c-primary); color: var(--c-primary); }
  .more-ico { color: var(--c-primary); }
  .more-divider { height: 1px; background: var(--c-border); margin: 16px 0 12px; }
  .more-utils { display: flex; flex-wrap: wrap; gap: 8px; }
}
</style>
