// ============================================================
// 现金流安全垫 · Edge Function: agnes-proxy
// 服务端代理 agnes-3.0-flash，实现 AI 记账 + 购物劝导
// 密钥仅在服务端（Deno 环境变量），不落地前端
// 对应 PRD 附录 A「AI 六模块契约」与 FR-08 / FR-13
// ============================================================

// 锁定版本：避免 unpinned CDN 依赖被上游变更或劫持
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";

// agnes-3.0-flash 接入点（OpenAI 兼容 chat/completions 形态，Bearer 鉴权）
const AGNES_URL = Deno.env.get("AGNES_API_URL") ?? "https://api.agnes-ai.cn/v1/chat/completions";
const AGNES_KEY = Deno.env.get("AGNES_API_KEY") ?? "";
const MODEL = "agnes-3.0-flash";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const MAX_TEXT = 500;
const MAX_CONTEXT = 4000;
const UPSTREAM_TIMEOUT_MS = 15000;

// 生产环境用 ALLOWED_ORIGINS 配置前端域名（逗号分隔）；
// 未配置时回显请求 Origin，保证本地与预览环境可用。
const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
  .split(",").map((s) => s.trim()).filter(Boolean);

function corsFor(req: Request): { headers: Record<string, string>; allowed: boolean } {
  const origin = req.headers.get("Origin") ?? "";
  const allowed = ALLOWED_ORIGINS.length === 0 || ALLOWED_ORIGINS.includes(origin);
  return {
    allowed,
    headers: {
      "Access-Control-Allow-Origin": allowed ? (origin || "*") : "null",
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Max-Age": "86400",
      "Vary": "Origin",
      "Cache-Control": "no-store",
    },
  };
}

function json(o: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(o), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

// 系统提示词：AI 记账（大白话 → 结构化草稿清单）
const PARSE_NOTE_SYSTEM = `你是个人现金流记账助手。把用户的大白话转成结构化草稿，绝不自行写入任何系统。
只输出一个 JSON 对象，不要任何解释文字。格式：
{
  "items": [
    {"date":"YYYY-MM-DD","direction":"收入|支出","category":"分类名（优先从用户常用分类清单里选）","amount":数字(元,正数),"note":"一句话备注","confidence":0到1的小数}
  ],
  "confidence": 0到1的小数
}
字段规则：
1. items 永远是有序数组。哪怕只有一笔，也要是长度为 1 的数组。
2. 一句话含多笔收支（"午饭45，打车23""买菜30、水果15"）必须逐笔列出，不得合并、不得遗漏；若用户只给了一个总金额且未指明明细，则记一笔，不得臆测拆分。
3. date：严格相对下方提供的「今天日期（北京时间）」推算；"昨天"=前一天；"前天"=前两天；"上周X""本周X"按日历倒推；"X号""X日"=本月X号（超本月天数则取月末）；"月初/月底"分别取1号/月末。拿不准就用今天日期。禁止输出与今天相差超过一个月的日期，禁止凭记忆编造年份。
4. direction 推断：含"发工资/到账/收/报销/奖金/退款/还我"等→收入；含"花/买/付/充/吃/打车/房租/还款/点"等→支出。
5. amount 必须是正数、单位元。"三十"→30，"3块5"→3.5，"花了45"→45。不得带负号、不得写"约"。
6. category：优先从「用户常用分类清单」里选最接近的一个；清单为空时按常见生活分类自行判断，也可用用户原文里的简短说法新建分类名（不超过 12 个字）。拿不准用"其他"，禁止臆造。
7. confidence：对该笔「日期/方向/金额/分类」四项整体把握度。任意一项不确定就 <0.7；顶层 confidence 取各笔的最小值。
8. 严禁编造用户没说过的日期、金额、笔数或分类；用户没提金额就不要估一个填进去。`;

// 系统提示词：购物劝导（结合现金流，理性且合规）
const ADVISE_PURCHASE_SYSTEM = `你是理性消费教练，帮刚工作的年轻人判断"该不该买某件东西"。
输入上下文(JSON)字段名与含义（前端由统一推演入口注入，均为真实数据）：
currentBalance=当前现金余额；monthMinBalance=月内最低余额；monthEndBalance=月末预计余额；
negativeFromDay=本月首次现金转负的日期(无则为 null)；monthlyNetSalary=当月到手工资；
upcomingRepayments=近期还款数组(元素含 date/amount/daysLeft)；topRisks=风险提示数组(元素含 title/detail)；
safetyLine=现金安全线(元)。字段可能缺失，缺失时按「信息不足」谨慎处理，严禁臆测任何金额。
只输出一个 JSON 对象，不要解释文字。格式：
{
  "advice":"劝买|劝缓|劝不买|中性",
  "reason":"基于现金流的简短理由(≤40字)",
  "risk_level":"低|中|高",
  "disclaimer":"仅供参考，不构成理财或投资建议，不承诺任何收益"
}
判断规则：
1. 若现金安全垫充足、近期无大额还款、月内最低余额仍为正，可"劝买"或"中性"；否则"劝缓"或"劝不买"。
2. 现金将转负、或近 7 天内有大额还款、或待收收入尚未到账时，优先"劝缓/劝不买"，并提示先留足周转金。
3. 禁止承诺收益、禁止建议借贷或分期消费来买非必需品、禁止诱导下单。
4. disclaimer 字段必填，且一字不改原文输出。`;

Deno.serve(async (req: Request) => {
  const { headers, allowed } = corsFor(req);
  const reply = (o: unknown, status = 200) => json(o, status, headers);

  // 浏览器跨域 POST（带 Authorization + application/json）会先发 OPTIONS 预检
  if (req.method === "OPTIONS") {
    return new Response(null, { status: allowed ? 204 : 403, headers });
  }
  if (req.method !== "POST") return reply({ error: "method not allowed" }, 405);
  if (!allowed) return reply({ error: "origin not allowed" }, 403);

  const auth = req.headers.get("Authorization") ?? "";
  const jwt = auth.replace(/^Bearer\s+/i, "");
  if (!jwt) return reply({ error: "unauthorized" }, 401);

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: auth } },
  });
  const { data: userData, error: ue } = await supabase.auth.getUser(jwt);
  if (ue || !userData.user) return reply({ error: "invalid token" }, 401);
  const userId = userData.user.id;

  let body: any;
  try { body = await req.json(); } catch { return reply({ error: "bad json" }, 400); }
  const action: string = body.action;
  if (!action) return reply({ error: "missing action" }, 400);

  // 输入限长：既约束上游 token 成本，也避免超长文本拖垮提示词
  const text = String(body.text ?? "").slice(0, MAX_TEXT);
  if (!text.trim()) return reply({ error: "missing text" }, 400);

  let systemPrompt = "";
  let userPrompt = "";
  if (action === "parse_note") {
    systemPrompt = PARSE_NOTE_SYSTEM;
    // 用户常用分类由前端传入：新增分类无需改服务端；清洗换行/引号并限长，降低提示词注入面
    const cats: string[] = Array.isArray(body.categories)
      ? body.categories
          .map((c: unknown) => String(c ?? "").replace(/[\r\n"'<>]/g, "").trim().slice(0, 16))
          .filter(Boolean)
          .slice(0, 40)
      : [];
    const catHint = cats.length ? `\n用户常用分类（优先从这里选）：${cats.join("、")}` : "";
    // 明确给出「今天」，否则相对日期会被模型按训练数据瞎猜（实测曾返回 2023 年）
    const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" });
    userPrompt = `\n今天日期（北京时间）：${today}\n请逐笔列出用户描述中的每一笔收支，不要遗漏。\n用户描述：${text}${catHint}`;
  } else if (action === "advise_purchase") {
    systemPrompt = ADVISE_PURCHASE_SYSTEM;
    userPrompt = JSON.stringify(body.context ?? {}).slice(0, MAX_CONTEXT) + "\n用户想买：" + text;
  } else {
    return reply({ error: "unknown action" }, 400);
  }

  if (!AGNES_URL || !AGNES_KEY) {
    console.error("agnes not configured");
    return reply({ error: "AI 服务未配置" }, 500);
  }

  try {
    const upstream = await fetch(AGNES_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + AGNES_KEY },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.2,
        response_format: { type: "json_object" },
      }),
    });
    if (!upstream.ok) {
      // 上游状态与异常详情只留服务端日志，不回传客户端
      console.error("agnes upstream error", upstream.status);
      return reply({ error: "AI 服务暂不可用" }, 502);
    }
    const data = await upstream.json();
    const content: string = data?.choices?.[0]?.message?.content ?? "{}";

    let parsed: any;
    try { parsed = JSON.parse(content); }
    catch { parsed = { raw: content, confidence: 0 }; }

    const confidence = typeof parsed.confidence === "number" ? parsed.confidence : null;

    // 记账草稿统一规整为数组，兼容模型偶尔返回旧的单对象格式；购物劝导保持原结构
    let resultPayload: any = parsed;
    let isDraft = confidence !== null && confidence < 0.7;
    if (action === "parse_note") {
      const items = Array.isArray(parsed?.items)
        ? parsed.items
        : (parsed && (parsed.date || parsed.amount != null) ? [parsed] : []);
      resultPayload = items;
      const levels = items
        .map((x: any) => (typeof x?.confidence === "number" ? x.confidence : 1))
        .concat(confidence === null ? [] : [confidence]);
      isDraft = (levels.length ? Math.min(...levels) : 0) < 0.7;
    }

    // AI 交互日志（反馈闭环 / 六模块第 6 项）：写日志失败不影响主流程返回
    try {
      await supabase.from("ai_interaction_log").insert({
        user_id: userId,
        action,
        raw_input: text,
        parsed_json: parsed,
        confidence,
        model_version: MODEL,
      });
    } catch (e) {
      console.error("ai log write failed", e);
    }

    // 低置信：仅返回草稿，前端强制用户确认后才落库（FR-08）
    return reply({ result: resultPayload, draft: isDraft });
  } catch (e) {
    console.error("agnes call failed", e);
    return reply({ error: "AI 服务暂不可用" }, 502);
  }
});
