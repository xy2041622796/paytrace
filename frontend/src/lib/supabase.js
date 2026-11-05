// ============================================================
// Supabase 客户端封装
// 仅使用 URL + anon key（前端公开安全，真正的数据隔离由 RLS 保证）
// 敏感操作（agnes 调用）走 Edge Function，密钥不落地前端
// ============================================================
import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  // 骨架阶段给明确提示，避免启动后静默失败
  console.warn('[supabase] 未检测到 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY，请复制 .env.example 为 .env 并填写')
}

export const supabase = createClient(url ?? '', anonKey ?? '', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // 纯密码登录 + hash 路由，无需从 URL 解析会话；关闭可缩小 token 经 URL/历史泄露面
    detectSessionInUrl: false
  }
})

// 调用本产品专属 Edge Function（agnes-proxy）
// action: 'parse_note' | 'advise_purchase'
export async function callAgnes(action, payload) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('未登录，无法调用 AI 能力')
  const fnUrl = `${url}/functions/v1/agnes-proxy`
  const res = await fetch(fnUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`
    },
    body: JSON.stringify({ action, ...payload })
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `AI 调用失败 (${res.status})`)
  }
  return res.json()
}
