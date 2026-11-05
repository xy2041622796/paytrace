// ============================================================
// 业务默认值与常量
// 说明：数据库字段 / API 契约保持英文（改动会牵连 RLS 与已有数据），
//       此处只放业务口径与用户可见的默认值。
// 数据来源：product_baseline.json（个人薪资现金流管理表 V7 真实口径）
// ============================================================

// 当前用户固定档案：入职日期、发薪日、工作制长期不变
export const USER_DEFAULTS = {
  city: '武汉江汉区',
  hireDate: '2026-07-13',
  payDay: 15,
  taxThreshold: 5000,
  workSchedule: '固定双休',
  workScheduleCode: 'double',
  salaryPhase: '转正后'
}

// 武汉江汉区 2026 社保 / 公积金基数（险种基数分套，不可合并）
export const SOCIAL_BASES = {
  sb_base_pension: 4552,
  sb_base_medical: 4498,
  sb_base_unemploy: 4498,
  sb_base_fund: 2400
}

// 现金安全垫阈值：低于此值提示「安全垫偏薄」
export const SAFETY_LINE = 200

// 配置类数据缓存时长（低频变更，可长时间复用）
export const CACHE_TTL = 12 * 60 * 60 * 1000

export const CACHE_VERSION = 1
