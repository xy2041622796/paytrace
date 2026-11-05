// ============================================================
// 社保 / 公积金规则解析
// ------------------------------------------------------------
// insurance_rule 是全局只读模板表（RLS：认证用户可读）。以前比例硬编码在
// useCashflow.js 的 RATE 里，表建了却没读，换城市就会算错钱。
// 这里把表行转成引擎可消费的比例对象；表为空 / 离线时回落到武汉 2026 口径，
// 保证「有规则用规则、没规则也能算」，但绝不静默给出看似正确的错数。
// ============================================================
import { round2 } from './validation'

export const FALLBACK_PERSONAL = {
  pension: 0.08,
  medical: 0.02,
  unemployment: 0.003,
  fund: 0.08,
  bigMedicalFixed: 7
}

export const FALLBACK_COMPANY = {
  pension: 0.16,
  medical: 0.08,
  unemployment: 0.007,
  injury: 0.006,
  fund: 0.08
}

// 表里的中文险种名 → 引擎字段名
const ITEM_KEY = {
  '养老': 'pension',
  '职工基本医疗保险': 'medical',
  '医疗': 'medical',
  '失业': 'unemployment',
  '公积金': 'fund',
  '大额医疗费用补助': 'bigMedicalFixed',
  '工伤': 'injury',
  '生育': 'maternity'
}

// 公司缴纳各项对应的基数（个人与公司用同一套基数，仅比例不同）
export const COMPANY_BASE = {
  pension: 'sb_base_pension',
  medical: 'sb_base_medical',
  unemployment: 'sb_base_unemploy',
  injury: 'sb_base_medical',
  maternity: 'sb_base_medical',
  fund: 'sb_base_fund'
}

export function parseInsuranceRules(rows, city = null) {
  const personal = { ...FALLBACK_PERSONAL }
  const company = { ...FALLBACK_COMPANY }
  let matched = 0
  const list = Array.isArray(rows) ? rows : []
  for (const r of list) {
    if (r.is_active === false) continue
    if (city && r.city !== city) continue
    const key = ITEM_KEY[r.item]
    if (!key) continue
    const value = r.category === 'fixed'
      ? Number(r.amount) || 0
      : Number(r.rate) || 0
    if (r.party === 'personal') {
      personal[key] = value
      matched++
    } else if (r.party === 'company' && key in company) {
      company[key] = value
      matched++
    }
  }
  const detectedCity = city || (list.find((r) => !city && r.city) || {}).city || ''
  return { personal, company, matched, city: detectedCity }
}

export function computeCompanyCost(companyRates, salaryConfig = {}) {
  const breakdown = {}
  let total = 0
  for (const [key, rate] of Object.entries(companyRates || {})) {
    const baseKey = COMPANY_BASE[key]
    if (!baseKey) continue
    const amount = round2((Number(salaryConfig[baseKey]) || 0) * (Number(rate) || 0))
    breakdown[key] = amount
    total = round2(total + amount)
  }
  return { total, breakdown }
}
