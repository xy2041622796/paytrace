<template>
  <div class="login-wrap">
    <button class="theme-toggle" @click="theme.toggle()">
      <AppIcon :name="theme.isDark ? 'sun' : 'moon'" :size="15" />
      {{ theme.isDark ? '切换浅色' : '切换深色' }}
    </button>

    <!-- 品牌叙事区：把「预测 + 预警」的产品定位讲清楚 -->
    <section class="brand-panel">
      <div class="brand-head">
        <span class="brand-mark"><AppIcon name="trend" :size="22" /></span>
        <b>现金流安全垫</b>
      </div>
      <div class="brand-copy">
        <span class="pt-eyebrow">CASHFLOW CUSHION</span>
        <h1>把现金流，<br />看在钱花出去之前。</h1>
        <p>不是事后记账，而是提前看清「哪天会没钱、哪天要还钱、还完还剩多少」。</p>
      </div>
      <div class="feature-list">
        <div v-for="f in features" :key="f.title" class="feature">
          <span class="feature-ico"><AppIcon :name="f.icon" :size="17" /></span>
          <span><b>{{ f.title }}</b><small>{{ f.desc }}</small></span>
        </div>
      </div>
      <div class="mini-card">
        <div class="mini-head"><span>本月现金流示意</span><span class="pt-chip pt-chip--success">安全垫充足</span></div>
        <div class="mini-chart">
          <svg viewBox="0 0 300 84" preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <linearGradient id="loginArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#FF9A6C" stop-opacity=".34" />
                <stop offset="100%" stop-color="#FF9A6C" stop-opacity="0" />
              </linearGradient>
            </defs>
            <path d="M0 62 L36 58 L72 60 L108 30 L144 34 L180 32 L216 52 L252 46 L300 50 L300 84 L0 84 Z" fill="url(#loginArea)" />
            <path d="M0 62 L36 58 L72 60 L108 30 L144 34 L180 32 L216 52 L252 46 L300 50" fill="none" stroke="#FF9A6C" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" />
            <circle cx="108" cy="30" r="4" fill="#FF9A6C" />
          </svg>
        </div>
        <div class="mini-foot"><span>发薪 11/15</span><span>还款 11/25</span><span>月末结余 <b>2,180.00</b></span></div>
      </div>
      <p class="brand-disclaimer">预测基于你的档案与假设，仅供参考，不构成理财建议。</p>
    </section>

    <!-- 表单区 -->
    <section class="form-panel">
      <n-card class="login-card" :bordered="true">
        <div class="form-eyebrow">{{ isLogin ? '欢迎回来' : '创建账本' }}</div>
        <h2 class="form-title">{{ isLogin ? '登录你的现金流账本' : '注册一个新账本' }}</h2>
        <p class="sub">{{ isLogin ? '继续查看你的余额、还款日与风险提示。' : '用户名即身份，数据仅本人可见。' }}</p>

        <n-form label-placement="top">
          <n-form-item label="用户名">
            <n-input v-model:value="username" placeholder="设置唯一用户名" :disabled="loading" />
          </n-form-item>
          <n-form-item label="密码">
            <n-input
              v-model:value="password"
              type="password"
              placeholder="至少 6 位"
              :disabled="loading"
              @keyup.enter="onSubmit"
            />
          </n-form-item>
        </n-form>

        <n-button type="primary" block :loading="loading" @click="onSubmit">
          {{ isLogin ? '登录' : '注册并登录' }}
        </n-button>
        <n-button text block class="switch" @click="isLogin = !isLogin">
          {{ isLogin ? '没有账号？去注册' : '已有账号？去登录' }}
        </n-button>

        <p v-if="error" class="err">{{ error }}</p>
        <p v-if="hint" class="hint">{{ hint }}</p>

        <div class="form-foot">
          <AppIcon name="lock" :size="14" />
          <span>薪资与负债数据受行级隔离保护，仅你本人可见。</span>
        </div>
        <p v-if="isDemoMode" class="demo-hint">
          <AppIcon name="info" :size="13" /> 当前为演示模式，输入任意用户名与密码即可进入，数据保存在本机浏览器。
        </p>
      </n-card>
    </section>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { useThemeStore } from '../stores/theme'
import { isDemoMode } from '../lib/supabase'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()
const theme = useThemeStore()

const features = [
  { icon: 'chart', title: '日度推演', desc: '按真实日历算出每天结束时的余额' },
  { icon: 'alert', title: '还款预警', desc: '提前发现现金转负与还款冲突' },
  { icon: 'sparkles', title: '大白话记账', desc: '一句话多笔，确认后才写入流水' }
]

const username = ref('')
const password = ref('')
const isLogin = ref(true)
const loading = ref(false)
const error = ref('')
const hint = ref('')

async function onSubmit() {
  error.value = ''
  hint.value = ''
  if (!username.value || !password.value) {
    error.value = '请输入用户名和密码'
    return
  }
  loading.value = true
  try {
    if (isLogin.value) {
      await auth.login(username.value, password.value)
    } else {
      const { session } = await auth.register(username.value, password.value)
      // 若 Supabase 开启了邮箱确认，session 为 null
      if (!session) {
        hint.value = '注册成功，请查收验证邮件后登录（若已关闭确认将自动登录）'
        loading.value = false
        return
      }
    }
    // 只接受站内绝对路径，避免把 query 里的外部地址交给 router
    const raw = String(route.query.redirect || '')
    const redirect = raw.startsWith('/') && !raw.startsWith('//') ? raw : '/dashboard'
    router.replace(redirect)
  } catch (e) {
    const msg = e.message || '操作失败'
    // 注册时若用户名重复，触发器唯一约束会失败，给出可读提示
    error.value = /username|Database error/i.test(msg) ? '用户名可能已被占用，请换一个' : msg
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-wrap {
  position: relative;
  min-height: 100vh;
  display: grid;
  grid-template-columns: 1.05fr 1fr;
  background: var(--c-bg);
}
.theme-toggle {
  position: absolute;
  top: 18px; right: 22px;
  z-index: 5;
  display: inline-flex; align-items: center; gap: 7px;
  padding: 7px 13px;
  border: 1px solid var(--c-border);
  border-radius: var(--r-pill);
  background: var(--c-surface);
  color: var(--c-text-2);
  font-size: 12.5px;
  font-family: inherit;
  cursor: pointer;
}
.theme-toggle:hover { border-color: var(--c-primary); color: var(--c-primary); }

/* ---------- 左侧品牌区 ---------- */
.brand-panel {
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  padding: 46px 56px 38px;
  color: #fff;
  background: linear-gradient(155deg, #1B2432 0%, #243247 52%, #3A2B2C 100%);
}
.brand-panel::before {
  content: '';
  position: absolute;
  width: 460px; height: 460px;
  right: -160px; top: -180px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(234, 98, 52, .32), transparent 68%);
}
.brand-panel::after {
  content: '';
  position: absolute;
  inset: auto 0 0 0;
  height: 40%;
  background: linear-gradient(transparent, rgba(11, 16, 24, .28));
  pointer-events: none;
}
.brand-head { display: flex; align-items: center; gap: 11px; position: relative; z-index: 1; }
.brand-head b { font-size: 16px; font-weight: 750; letter-spacing: -.01em; }
.brand-mark {
  width: 38px; height: 38px;
  display: inline-flex; align-items: center; justify-content: center;
  border-radius: 11px;
  background: var(--c-primary);
  box-shadow: 0 6px 18px rgba(234, 98, 52, .4);
}
.brand-copy { position: relative; z-index: 1; margin-top: 64px; }
.brand-copy .pt-eyebrow { color: #FFB08A; }
.brand-copy h1 {
  font-size: clamp(30px, 3.2vw, 46px);
  line-height: 1.24;
  font-weight: 780;
  letter-spacing: -.025em;
  margin: 12px 0 18px;
}
.brand-copy p { font-size: 14px; line-height: 1.9; color: rgba(255, 255, 255, .72); max-width: 460px; margin: 0; }
.feature-list { position: relative; z-index: 1; display: grid; gap: 18px; margin-top: 40px; }
.feature { display: flex; align-items: flex-start; gap: 13px; }
.feature-ico {
  width: 34px; height: 34px; flex: none;
  display: inline-flex; align-items: center; justify-content: center;
  border-radius: 10px;
  background: rgba(255, 255, 255, .1);
  color: #FFB08A;
  border: 1px solid rgba(255, 255, 255, .12);
}
.feature span:last-child { display: flex; flex-direction: column; gap: 2px; }
.feature b { font-size: 13.5px; font-weight: 700; }
.feature small { font-size: 12px; color: rgba(255, 255, 255, .6); }

.mini-card {
  position: relative; z-index: 1;
  margin-top: auto;
  background: rgba(255, 255, 255, .08);
  border: 1px solid rgba(255, 255, 255, .14);
  border-radius: var(--radius-lg);
  padding: 18px 20px 14px;
  backdrop-filter: blur(8px);
}
.mini-head { display: flex; align-items: center; justify-content: space-between; font-size: 12px; color: rgba(255, 255, 255, .8); }
.mini-head .pt-chip { background: rgba(69, 201, 154, .18); color: #7BE0B8; }
.mini-chart svg { width: 100%; height: 84px; display: block; margin: 10px 0 6px; }
.mini-foot { display: flex; justify-content: space-between; font-size: 11px; color: rgba(255, 255, 255, .6); }
.mini-foot b { color: #fff; font-variant-numeric: tabular-nums; }
.brand-disclaimer { position: relative; z-index: 1; font-size: 11px; color: rgba(255, 255, 255, .45); margin: 14px 0 0; }

/* ---------- 右侧表单区 ---------- */
.form-panel { display: flex; align-items: center; justify-content: center; padding: 60px 32px; }
.login-card {
  width: 100%; max-width: 400px;
  border: 1px solid var(--c-border) !important;
  border-radius: var(--radius-lg) !important;
  box-shadow: var(--shadow-md) !important;
  animation: login-pop var(--dur-slow) var(--ease-out) backwards;
}
.form-eyebrow {
  font-size: 11px; font-weight: 800; letter-spacing: .12em;
  color: var(--c-primary); text-transform: uppercase;
}
.form-title { font-size: 22px; font-weight: 750; margin: 8px 0 6px; color: var(--c-text); letter-spacing: -.01em; }
.sub { color: var(--c-text-2); font-size: 13px; margin: 0 0 22px; line-height: 1.7; }
.switch { margin-top: 12px; }
.err, .hint {
  font-size: 13px; margin-top: 12px;
  animation: login-fade var(--dur-base) var(--ease-out) backwards;
}
.err { color: var(--c-danger); }
.hint { color: var(--c-success); }
.form-foot {
  display: flex; align-items: center; gap: 7px;
  margin-top: 22px; padding-top: 16px;
  border-top: 1px solid var(--c-border);
  font-size: 11.5px; color: var(--c-text-3);
  line-height: 1.6;
}
.demo-hint {
  display: flex; align-items: flex-start; gap: 6px;
  margin: 12px 0 0; padding: 9px 11px;
  border-radius: var(--r-sm);
  background: var(--c-info-soft);
  color: var(--c-info);
  font-size: 11.5px; line-height: 1.6;
}
@keyframes login-pop {
  from { opacity: 0; transform: scale(.97) translateY(10px); }
  to   { opacity: 1; transform: scale(1) translateY(0); }
}
@keyframes login-fade {
  from { opacity: 0; transform: translateY(-4px); }
  to   { opacity: 1; transform: translateY(0); }
}

@media (max-width: 900px) {
  .login-wrap { grid-template-columns: 1fr; }
  .brand-panel { display: none; }
  .form-panel { padding: 80px 20px 40px; }
  .theme-toggle { top: 16px; right: 16px; }
}
</style>
