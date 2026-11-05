<template>
  <div class="login-wrap">
    <n-button class="theme-toggle" size="small" quaternary @click="theme.toggle()">
      {{ theme.isDark ? '切换浅色' : '切换深色' }}
    </n-button>
    <n-card class="login-card" :bordered="true">
      <div class="brand">
        <span class="dot" /> 现金流安全垫
      </div>
      <p class="sub">登录 / 注册后，开始预测你的现金流安全垫</p>

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
    </n-card>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { useThemeStore } from '../stores/theme'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()
const theme = useThemeStore()

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
    const redirect = route.query.redirect || '/dashboard'
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
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: var(--c-bg);
}
.theme-toggle { position: absolute; top: 16px; right: 20px; }
.login-card { width: 100%; max-width: 360px; border: 1px solid var(--c-border); border-radius: var(--radius); }
.brand { font-size: 18px; font-weight: 600; display: flex; align-items: center; gap: 8px; }
.dot { width: 10px; height: 10px; border-radius: 50%; background: var(--c-primary); }
.sub { color: var(--c-text-2); font-size: 13px; margin: 8px 0 18px; }
.switch { margin-top: 10px; }
.err { color: var(--c-danger); font-size: 13px; margin-top: 12px; }
.hint { color: var(--c-success); font-size: 13px; margin-top: 12px; }
</style>
