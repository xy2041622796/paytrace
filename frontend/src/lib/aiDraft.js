// ============================================================
// AI 记账草稿清单
// 服务端结果 → 可编辑草稿；所有写入都必须经 collectWritable 过校验层。
// 纯函数，便于回归测试；不碰 localStorage、不碰网络。
// 习惯数据（别名 / 常用分类）由调用方以 options 注入，保持本模块可测。
//
// 分类策略（尽量替用户判好，不让他逐条改）：
//   1. 用户学过的别名优先（「午饭」→ 他自己改成的「工作餐」）；
//   2. 模型返回值若已在分类清单内，直接采用；
//   3. 否则用确定性关键词规则重新判一次；
//   4. 仍判不出给「其他」兜底，草稿永远可写。
// ============================================================
import { validateTransaction } from './validation'
import { todayISO } from './date'

const DIRECTION_MAP = { 收入: 'income', 支出: 'expense' }
let seq = 0
const uid = () => `draft-${Date.now()}-${++seq}`

// 默认分类清单：不再局限 8 类，覆盖更细的生活场景；用户可自由新增任意分类。
// 前端会把「默认清单 + 你的常用分类」一起传给模型，服务端提示词不写死枚举。
export const DEFAULT_CATEGORIES = [
  '餐饮', '早餐', '午餐', '晚餐', '外卖', '零食', '饮品', '水果',
  '话费', '网费', '水电', '房租', '日用', '购物', '服饰', '美妆',
  '通勤', '打车', '公交', '加油', '停车', '娱乐', '订阅', '旅游',
  '医疗', '药品', '健身', '教育', '书籍', '人情', '礼金', '宠物',
  '还款', '手续费', '工资', '奖金', '补贴', '报销', '其他'
]
export const CATEGORY_OPTIONS = DEFAULT_CATEGORIES

// 顺序即优先级：先命中特异性词，再命中泛词。正则不带 g，避免 lastIndex 串状态。
const CATEGORY_RULES = [
  ['药品', /(买药|药品|药店|疫苗)/],
  ['医疗', /(医院|看病|挂号|体检|门诊|药费|牙科)/],
  ['话费', /(话费|手机费|充值话费)/],
  ['网费', /(网费|宽带)/],
  ['水电', /(水费|电费|水电|燃气)/],
  ['房租', /(房租|租金|房东)/],
  ['打车', /(打车|出租|滴滴|网约车)/],
  ['公交', /(地铁|公交|公交卡|单车|共享单车|骑行)/],
  ['加油', /(加油|油费)/],
  ['停车', /(停车费|停车)/],
  ['通勤', /(通勤|车费|交通|高铁|火车)/],
  ['早餐', /(早餐|早饭|早点)/],
  ['午餐', /(午饭|午餐|中饭)/],
  ['晚餐', /(晚饭|晚餐|夜宵)/],
  ['外卖', /(外卖|美团|饿了么|点餐)/],
  ['餐饮', /(餐厅|吃饭|快餐|食堂|餐饮|火锅|料理|下馆子|面馆)/],
  ['饮品', /(奶茶|咖啡|饮料|可乐|矿泉水|买水)/],
  ['水果', /(水果|买水果)/],
  ['零食', /(零食|小吃|酸奶|面包|蛋糕|饼干)/],
  ['服饰', /(买衣服|衣服|鞋子|买鞋|服饰|裤子|外套)/],
  ['美妆', /(化妆品|护肤|美妆|口红)/],
  ['日用', /(日用品|纸巾|洗衣液|超市|买菜|家居)/],
  ['购物', /(淘宝|京东|拼多多|网购|购物|下单|快递|商场)/],
  ['订阅', /(会员|订阅|续费)/],
  ['娱乐', /(电影|影院|游戏|演唱会|ktv|剧本杀|门票|娱乐)/i],
  ['旅游', /(旅游|旅行|酒店|民宿|机票|景点)/],
  ['健身', /(健身|健身房|游泳|运动)/],
  ['教育', /(学费|培训|课程|网课|考试|报名费)/],
  ['书籍', /(买书|书籍|图书|书店)/],
  ['人情', /(人情|随礼|份子钱|送礼)/],
  ['礼金', /(礼金|红包)/],
  ['宠物', /(宠物|猫粮|狗粮|宠物医院)/],
  ['还款', /(还款|还白条|还花呗|月供|分期)/],
  ['手续费', /(手续费|延期费|利息)/],
  ['工资', /(工资|发薪|薪水)/],
  ['奖金', /(奖金|年终奖)/],
  ['补贴', /(补贴)/],
  ['报销', /(报销)/]
]

// 用户学过的别名优先：他改过的分类，下次同类说法直接套用
function matchAlias(text, aliases) {
  const s = String(text ?? '')
  if (!s || !aliases || typeof aliases !== 'object') return ''
  for (const [from, to] of Object.entries(aliases)) {
    if (from && s.includes(from) && to) return String(to)
  }
  return ''
}

// 从一段自然语言里判一个分类；判不出返回空串（不硬猜）
export function inferCategory(text, options = {}) {
  const s = String(text ?? '').trim()
  if (!s) return ''
  const learned = matchAlias(s, options.aliases)
  if (learned) return learned
  for (const [name, re] of CATEGORY_RULES) {
    if (re.test(s)) return name
  }
  return ''
}

// hint 通常是该笔备注或用户原文；options.categories 为用户常用分类清单
export function normalizeCategory(value, hint = '', options = {}) {
  const s = String(value ?? '').trim()
  const categories = Array.isArray(options.categories) && options.categories.length
    ? options.categories
    : CATEGORY_OPTIONS
  if (categories.includes(s)) return s
  if (!options.fromModel) {
    // 用户明确填写的分类一律尊重，不做规则重判（「孩子学费」不能被「学费」改成「教育」）；
    // 只有分类为空时才用备注推断，最后兜底「其他」。
    return s || inferCategory(hint, options) || '其他'
  }
  // 模型给的分类：别名 → 关键词规则 → 备注/原文 → 原值 → 兜底
  return inferCategory(s, options) || inferCategory(hint, options) || s || '其他'
}

export function makeBlankDraft() {
  return {
    id: uid(),
    txn_date: todayISO(),
    direction: 'expense',
    category: '',
    originalCategory: '',
    amount: null,
    note: '',
    source: 'manual',
    confidence: null,
    selected: true
  }
}

// 兼容四种服务端形态：数组 / {items:[]} / 单对象 / 空
export function normalizeAiResult(res, rawText = '', options = {}) {
  const raw = res?.result
  const list = Array.isArray(raw) ? raw
    : Array.isArray(res?.items) ? res.items
      : Array.isArray(raw?.items) ? raw.items
        : raw ? [raw] : []
  return list.map((p) => {
    // 一句话多笔时优先用「这一笔自己的备注」判类，避免整段原文把多笔串成同一类
    const hint = String(p?.note || '').trim() || String(rawText || '')
    return {
      id: uid(),
      txn_date: String(p?.date || p?.txn_date || todayISO()),
      direction: DIRECTION_MAP[p?.direction] || p?.direction || 'expense',
      category: normalizeCategory(p?.category, hint, { ...options, fromModel: true }),
      // 模型原始输出：用户改过分类时用来学习别名，不写入数据库
      originalCategory: String(p?.category || '').trim(),
      amount: p?.amount == null ? null : Number(p.amount),
      note: String(p?.note || ''),
      source: 'ai',
      confidence: typeof p?.confidence === 'number' ? p.confidence : null,
      selected: true
    }
  })
}

export function isLowConfidence(item) {
  return item?.confidence != null && item.confidence < 0.7
}

export function validateDraft(draft, options = {}) {
  const rawCategory = String(draft?.category ?? '').trim()
  const hint = String(draft?.note ?? '').trim()
  // 分类留空但备注能判出来时自动归一；分类与备注都空则保持严格校验，不默默写「其他」
  const category = (rawCategory || hint) ? normalizeCategory(rawCategory, hint, options) : ''
  return validateTransaction({
    txn_date: draft?.txn_date,
    direction: draft?.direction,
    category,
    amount: draft?.amount,
    note: draft?.note,
    source: draft?.source
  })
}

// onlyId 不为空时表示「只写这一笔」，忽略勾选状态；否则只写已勾选且合法的条目
export function collectWritable(drafts, onlyId = null, options = {}) {
  const writable = []
  const invalid = []
  for (const d of (Array.isArray(drafts) ? drafts : [])) {
    if (onlyId && d.id !== onlyId) continue
    if (!onlyId && !d.selected) continue
    const checked = validateDraft(d, options)
    if (!checked.ok) {
      invalid.push({ id: d.id, error: checked.error })
      continue
    }
    writable.push({ id: d.id, value: checked.value })
  }
  return { writable, invalid }
}
