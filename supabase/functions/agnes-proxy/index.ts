// ============================================================
// 现金流安全垫 · Edge Function: agnes-proxy
// 服务端代理 agnes-3.0-flash，实现 AI 记账 + 购物劝导
// 密钥仅在服务端（Deno 环境变量），不落地前端
// 对应 PRD 附录 A「AI 六模块契约」与 FR-08 / FR-13
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// agnes-3.0-flash 接入点（OpenAI 兼容 chat/completions 形态，Bearer 鉴权）
// 已确认：Base URL https://api.agnes-ai.cn/v1，Chat Completions POST /v1/chat/completions
// 输入模态：文本 / 图像 URL；输出模态：文本（当前仅用文本）
const AGNES_URL = Deno.env.get("AGNES_API_URL") ?? "https://api.agnes-ai.cn/v1/chat/completions";
const AGNES_KEY = Deno.env.get("AGNES_API_KEY") ?? "";
const MODEL = "agnes-3.0-flash";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

function json(o: unknown, status = 200): Response {
  return new Response(JSON.stringify(o), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

// 系统提示词：AI 记账（大白话 → 结构化草稿清单）
const PARSE_NOTE_SYSTEM = `你是个人现金流记账助手。把用户的大白话转成结构化草稿，绝不自行写入任何系统。
只输出一个 JSON 对象，不要任何解释文字。格式：
{
  "items": [
    {"date":"YYYY-MM-DD","direction":"收入|支出","category":"餐饮|话费|通勤|零食|购物|娱乐|医疗|其他","amount":数字(元,正数),"note":"一句话备注","confidence":0到1的小数}
  ],
  "confidence": 0到1的小数
}
字段规则：
1. items 永远是有序数组。哪怕只有一笔，也要是长度为 1 的数组。
2. 一句话含多笔收支（"午饭45，打车23""买菜30、水果15"）必须逐笔列出，不得合并、不得遗漏；若用户只给了一个总金额且未指明明细，则记一笔，不得臆测拆分。
3. date：相对"今天"推算。今天=系统给定当天；"昨天"=前一天；"前天"=前两天；"上周X""本周X"按日历倒推；"X号""X日"=本月X号（超本月天数则取月末）；"月初/月底"分别取1号/月末。拿不准给今天。
4. direction 推断：含"发工资/到账/收/报销/奖金/退款/还我"等→收入；含"花/买/付/充/吃/打车/房租/还款/点"等→支出。
5. amount 必须是正数、单位元。"三十"→30，"3块5"→3.5，"花了45"→45。不得带负号、不得写"约"。
6. category 只能取枚举之一，拿不准用"其他"。
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
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const auth = req.headers.get("Authorization") ?? "";
  const jwt = auth.replace(/^Bearer\s+/i, "");
  if (!jwt) return json({ error: "unauthorized" }, 401);

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: auth } },
  });
  const { data: userData, error: ue } = await supabase.auth.getUser(jwt);
  if (ue || !userData.user) return json({ error: "invalid token" }, 401);
  const userId = userData.user.id;

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }
  const action: string = body.action;
  if (!action) return json({ error: "missing action" }, 400);

  let systemPrompt = "";
  let userPrompt = "";
  if (action === "parse_note") {
    systemPrompt = PARSE_NOTE_SYSTEM;
    userPrompt = String(body.text ?? "");
  } else if (action === "advise_purchase") {
    systemPrompt = ADVISE_PURCHASE_SYSTEM;
    userPrompt = JSON.stringify(body.context ?? {}) + "\n用户想买：" + String(body.text ?? "");
  } else {
    return json({ error: "unknown action" }, 400);
  }

  if (!AGNES_URL || !AGNES_KEY) {
    return json({ error: "agnes not configured" }, 500);
  }

  try {
    const upstream = await fetch(AGNES_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + AGNES_KEY },
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
      return json({ error: "agnes upstream error", status: upstream.status }, 502);
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

    // AI 交互日志（反馈闭环 / 六模块第 6 项）
    await supabase.from("ai_interaction_log").insert({
      user_id: userId,
      action,
      raw_input: body.text ?? "",
      parsed_json: parsed,
      confidence,
      model_version: MODEL,
    });

    // 低置信：仅返回草稿，前端强制用户确认后才落库（FR-08）
    return json({ result: resultPayload, draft: isDraft });
  } catch (e) {
    return json({ error: "agnes call failed", detail: String(e) }, 502);
  }
});
