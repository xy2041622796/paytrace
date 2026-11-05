# Edge Function: agnes-proxy 部署说明

服务端代理 `agnes-3.0-flash`，实现 AI 自然语言记账（FR-08）与购物劝导（FR-13）。
密钥仅在 Deno 服务端环境变量，不暴露给前端；调用方须带 Supabase 用户 JWT，RLS 与用户身份双重校验。

## 1. 配置密钥（Secrets）

在 Supabase 项目后台 → Edge Functions → Secrets，或在 CLI：

```bash
supabase secrets set AGNES_API_URL="https://api.agnes-ai.cn/v1/chat/completions"
supabase secrets set AGNES_API_KEY="<从 agnes 控制台获取的密钥>"
# SUPABASE_URL / SUPABASE_ANON_KEY 由 Supabase 自动注入，无需手动设置
```
> 安全提示：API Key 仅存于 Supabase Secrets（服务端），**切勿提交到代码仓库或前端**。

> 已确认 agnes-3.0-flash 端点为 OpenAI 兼容的 Chat Completions 形态（`POST /v1/chat/completions`，Bearer 鉴权），本函数无需改动即可对接。agnes 另提供 Responses API（`/v1/responses`）与 Messages API（`/v1/messages`），当前未使用。输入支持文本与图像 URL（当前仅用文本，后续可扩展「截图记账」传入图像 URL）。

## 2. 部署

```bash
supabase functions deploy agnes-proxy
```

部署时若使用自定义 JWT 校验，可不加 `--no-verify-jwt`（本函数内部已用 `auth.getUser(jwt)` 校验用户身份，建议保留 JWT 校验）。

## 3. 前端调用（Vue3 示例）

```ts
// src/lib/agnes.ts
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
const session = /* 来自 supabase auth 的当前会话 */

// AI 记账：大白话 → 草稿
export async function aiParseNote(text: string) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/agnes-proxy`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ action: 'parse_note', text }),
  })
  const { result, draft } = await res.json()
  // result 是草稿数组（一句话可含多笔）；旧版部署返回单对象，前端 normalizeAiResult 两种都兼容
  // draft=true → 置信度偏低，前端逐条标黄；无论如何都必须经用户确认才写 transaction（来源=ai）
  return { result, draft }
}

// AI 购物劝导
export async function aiAdvise(text: string, context: object) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/agnes-proxy`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ action: 'advise_purchase', text, context }),
  })
  const { result } = await res.json()
  // result.disclaimer 必含"仅供参考"，前端须展示
  return result
}
```

## 4. 验收对照（PRD FR-08 / FR-13 / 附录 A）

- 低置信（confidence < 0.7）返回 `draft: true` → 前端逐条标黄，不直接写库 ✅
- `parse_note` 的 `result` 为草稿数组；一句话多笔时逐笔列出，模型偶尔返回旧单对象也由服务端规整成数组 ✅
- 前端把草稿列成可编辑清单，逐条修改 / 删除 / 手动新增 / 勾选，单条或批量写入前统一过校验层 ✅
- 购物建议 `disclaimer` 字段必填，含"不构成理财/投资建议，不承诺任何收益" ✅
- 每次调用写入 `ai_interaction_log`（原始输入 / 解析结果 / 置信度 / 模型版本），支撑反馈闭环 ✅
- 未配置密钥 / 上游异常 → 返回明确错误，前端可降级为手动记账 ✅
