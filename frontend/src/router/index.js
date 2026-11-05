import { createRouter, createWebHashHistory } from 'vue-router'
import { supabase } from '../lib/supabase'

// hash 模式：静态托管（Vercel 等）无需 rewrite 配置
// 布局嵌套：内部页面统一套 AppLayout（侧边栏）；登录页独立、不套布局
const routes = [
  {
    path: '/login',
    name: 'login',
    component: () => import('../views/Login.vue'),
    meta: { public: true }
  },
  {
    path: '/',
    component: () => import('../components/AppLayout.vue'),
    children: [
      { path: '', redirect: 'dashboard' },
      { path: 'dashboard', name: 'dashboard', component: () => import('../views/Dashboard.vue') },
      { path: 'calendar', name: 'calendar', component: () => import('../views/Calendar.vue') },
      { path: 'settings', name: 'settings', component: () => import('../views/Settings.vue') },
      { path: 'ai-note', name: 'ai-note', component: () => import('../views/AINote.vue') },
      { path: 'ledger', name: 'ledger', component: () => import('../views/Ledger.vue') },
      { path: 'check', name: 'check', component: () => import('../views/DataCheck.vue') },
      { path: 'todo', name: 'todo', component: () => import('../views/Todo.vue') }
    ]
  }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

// 登录守卫：非公开路由必须有会话
router.beforeEach(async (to) => {
  if (to.meta.public) return true
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { name: 'login', query: { redirect: to.fullPath } }
  return true
})

export default router
