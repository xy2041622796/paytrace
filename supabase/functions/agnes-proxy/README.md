# Edge Function: agnes-proxy 部署说明

服务端代理 `agnes-3.0-flash`，实现 AI 自然语言记账（FR-08）与购物劝导（FR-13）。
密钥仅在 Deno 服务端环境变量，不暴露给前端；调用方须带 Supabase 用户 JWT，RLS 与用户身份双重校验。

## 1. 配置密钥（Secrets）

在 Supabase 项目后台 → Edge Functions → Secrets，或在 CLI：

```bash
supabase secrets set AGNES_API_URL="https://api.agnes-ai.cn/v1/chat/completions"
supabase secrets set AGNES_API_KEY="<从 agnes 控制台获取的密钥>"
supabase secrets set ALLOWED_ORIGINS="https://你的前端域名"
# SUPABASE_URL / SUPABASE_ANON_KEY 由 Supabase 自动注入，无需手动设置
```
> 安全提示：API Key 仅存于 Supabase Secrets（服务端），**切勿提交到代码仓库或前端**。

> 已确认 agnes-3.0-flash 端点为 OpenAI 兼容的 Chat Completions 形态（`POST /v1/chat/completions`，Bearer 鉴权），本函数无需改动即可对接。agnes 另提供 Responses API（`/v1/responses`）与 Messages API（`/v1/messages`），当前未使用。输入支持文本与图像 URL（当前仅用文本，后续可扩展「截图记账」传入图像 URL）。

## 2. 部署

```bash
supabase functions deploy agnes-proxy
```

部署时若使用自定义 JWT 校验，可不加 `--no-verify-jwt`（本函数内部已用 `auth.getUser(jwt)` 校验用户身份，建议保留 JWT 校验）。

> **CORS / 输入约束**：浏览器跨域调用会先发 `OPTIONS` 预检，函数已内置预检分支。**必须配置 `ALLOWED_ORIGINS`（逗号分隔的前端域名）**；未配置时仅放行同源或无 `Origin` 的调用，跨域一律拒绝（403），绝不回显任意 `Origin`（本地/预览也需把地址加进白名单）。`text` 上限 500 字、上下文 4000 字，上游调用 15s 超时；所有拼入提示词的字符串都经控制字符清洗、限长与 `JSON.stringify` 转义，避免提示词注入；上游异常详情只写服务端日志，不回传客户端。

> **动态分类清单**：`parse_note` 请求可带 `categories`（字符串数组，前端由本机「分类习惯」生成）。函数清洗换行/引号、每项截 16 字、最多 40 项后注入提示词，模型优先从该清单里选分类，清单为空时按常见生活分类自行判断，也允许用户原文里的简短新分类名。因此**新增分类只需前端改，无需再改服务端**。提示词本次有调整，需重新部署：`supabase functions deploy agnes-proxy`。

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
- 上游超时 / 拒答 / 解析失败 / 条目全不合法 → 返回可展示的降级结果（HTTP 200，带 `rawText`），前端引导手动补录；真正的 5xx / 网络故障仍返回错误并带 `rawText` ✅

## 5. 返回契约补充（本次修订）

### 上下文字段对齐（advise_purchase）

字段名以 `frontend/src/views/AINote.vue` 的 `buildFinancialContext()` 为准：
`year / month / currency / currentBalance / monthMinBalance / monthEndBalance / negativeFromDay / monthlyNetSalary / safetyLine / upcomingRepayments / topRisks`。
其中 `upcomingRepayments` 元素字段为 `date / amount / daysFromToday`（**不是 `daysLeft`**）；`topRisks` 元素为 `title / detail`。
FR-13 要求的「月预算 / 待收收入」前端当前未注入：服务端补 `monthlyBudget`（数值）与 `pendingIncome`（数组，元素 `type / est_amount / status`）两个字段，缺失时值为字符串「未提供」，提示词明确禁止据此臆测金额或当成已到账。前端后续若补齐这两个字段，服务端会自动采用（清洗后）。

### 新增 / 变更的返回字段

| 字段 | 出现场景 | 说明 |
| --- | --- | --- |
| `degraded: true`（顶层） | 超时 / 拒答 / 解析失败 / 条目全不合法 | HTTP **200** 的可展示降级结果，同时 `result` 为 `{ degraded: true, rawText, message }`。前端应先判断 `degraded`，直接提示「请手动补录」，**不要**把 `result` 喂给 `normalizeAiResult`。 |
| `rawText` | 降级结果 + 系统错误响应 | 清洗限长后的原始输入。系统错误（5xx / 网络故障 / 配置缺失）返回 `{ error, rawText }`，状态码仍为 502/500。 |
| `uncertainFields?: string[]` | 仅 `draft: true` 时 | 列出需用户重点核对的字段名，如 `date / direction / category / amount`（购物劝导为 `advice`）。 |

### 服务端校验（parse_note）

逐条剔除非法条目：`date` 需为合法 `YYYY-MM-DD` 且与今天相差 `[-31, +1]` 天；`direction` 接受 `income/expense` 与中文「收入/支出」并归一为英文；`category` 非空且 ≤16 字；`amount` 为有限正数并保留两位小数。全部条目被剔除即返回降级结果。低置信（`confidence < 0.7`）强制 `draft: true` 并附 `uncertainFields`。

### 交互日志

`ai_interaction_log` 无 `detail` 列，服务端把 `model_version`、`modified_fields`（服务端归一/修正过的字段名）、`degraded`、`reason`、`removed_items`、`uncertain_fields` 等写进 `parsed_json._detail`（jsonb），**未改动 SQL 迁移**；降级路径同样写日志。前端 `DataCheck.vue` 只展示固定列、不解析 `parsed_json`，不受影响。
