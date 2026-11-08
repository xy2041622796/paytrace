-- ============================================================
-- 现金流安全垫 · 真实业务数据种子（幂等）
-- 数据来源：product_baseline.json（个人薪资现金流管理表 V7 真实口径）
-- 目标账号：3a4c9ead-24ff-468c-b259-e0a5e28ba2c9 / xy@paytrace.local
--
-- ⚠️ 执行前必读
-- 1. 「第 0 段」会删除明确列出的测试数据行，属于破坏性操作。
--    执行前请先到「数据体检」页点「导出全量备份」留存 JSON 快照。
--    若你已手动删过测试数据，可直接跳过第 0 段。
-- 2. 所有语句都带 user_id 限定，不影响其他租户；不改表结构、不动 RLS。
-- 3. 第 1 段起全部带 where not exists，整份重跑不会产生重复行。
--
-- ⚠️ 两个需要你确认的判断
-- A. 转正税前月薪：baseline 记「转正后 5000」、「申请 6000 待 HR 确认」，
--    11 月现金流汇总按 5000 算，本脚本按 5000 落库。
--    若 HR 已确认 6000，把第 2 段的 5000 改成 6000 即可；
--    仪表盘「假设税前月薪」可直接试算 6000，不必改库。
-- B. 支出拆分口径：baseline 的「月固定开支 1420」含手机分期 241，
--    而 11.15 手机分期 241 又是一笔独立账单。为避免重复扣款，
--    本脚本把手机分期与白条放进还款日历，月固定开支只放 1179：
--      餐饮 1048 + 零食 50 + 话费 65 + 单车 16 = 1179
--    另有 11.1 话费充值 100 属当月一次性支出，未导入（可在流水账本补记）。
--    逐日零散的餐饮/零食在 MVP 里按「每月 1 日一次性」简化。
-- ============================================================

-- ------------------------------------------------------------
-- 第 0 段：清理早期测试数据（破坏性，确认后执行）
-- 只删下列精确匹配的行；不会碰到你后来手动新增的其他数据
-- ------------------------------------------------------------
delete from public.expense_category
where user_id = '3a4c9ead-24ff-468c-b259-e0a5e28ba2c9'::uuid
  and name = '房租' and monthly_amount = 1500;

delete from public.expense_category
where user_id = '3a4c9ead-24ff-468c-b259-e0a5e28ba2c9'::uuid
  and name = '话费' and monthly_amount = 50;

delete from public.expense_category
where user_id = '3a4c9ead-24ff-468c-b259-e0a5e28ba2c9'::uuid
  and name = '通勤' and monthly_amount = 200;

delete from public.repayment_event
where user_id = '3a4c9ead-24ff-468c-b259-e0a5e28ba2c9'::uuid
  and due_date = '2026-11-15'::date and amount = 800;

-- 早期插入的 6000 测试薪资版本（真实值见第 2 段）
delete from public.salary_config
where user_id = '3a4c9ead-24ff-468c-b259-e0a5e28ba2c9'::uuid
  and pre_tax_salary = 6000;

-- ------------------------------------------------------------
-- 第 1 段：个人档案
-- ------------------------------------------------------------
update public.profiles
set city          = '武汉江汉区',
    hire_date     = '2026-07-13'::date,
    pay_day       = 15,
    tax_threshold = 5000
where user_id = '3a4c9ead-24ff-468c-b259-e0a5e28ba2c9'::uuid;

-- ------------------------------------------------------------
-- 第 2 段：薪资与社保基数（追加新版本，不覆盖历史）
-- 11 月起养老基数 4552（7-10 月旧基数 4498，补差 54/月）
-- 医疗/失业基数 4498，公积金基数 2400
-- ------------------------------------------------------------
insert into public.salary_config
  (user_id, phase, pre_tax_salary, sb_base_pension, sb_base_medical, sb_base_unemploy, sb_base_fund)
select '3a4c9ead-24ff-468c-b259-e0a5e28ba2c9'::uuid,
       'regular', 5000, 4552, 4498, 4498, 2400
where not exists (
  select 1 from public.salary_config s
  where s.user_id = '3a4c9ead-24ff-468c-b259-e0a5e28ba2c9'::uuid
    and s.phase = 'regular'
    and s.pre_tax_salary = 5000
);

-- ------------------------------------------------------------
-- 第 3 段：月固定开支（合计 1179，口径见文件头说明 B）
-- ------------------------------------------------------------
insert into public.expense_category (user_id, name, monthly_amount, deduct_day)
select '3a4c9ead-24ff-468c-b259-e0a5e28ba2c9'::uuid, v.name, v.amt, v.dd
from (values
  ('餐饮',          1048, 1),
  ('零食机动',        50, 1),
  ('话费',            65, 1),
  ('共享单车月卡',    16, 1)
) as v(name, amt, dd)
where not exists (
  select 1 from public.expense_category e
  where e.user_id = '3a4c9ead-24ff-468c-b259-e0a5e28ba2c9'::uuid
    and e.name = v.name
);

-- ------------------------------------------------------------
-- 第 4 段：负债清单
-- 手机分期为推算值：24 期 × 241 = 5784，已还 7 期 = 1687，剩余 17 期 = 4097
-- 话费与单车月卡 81 = 主卡 60 + 副卡 5 + 月卡 16，属月度固定
-- ------------------------------------------------------------
insert into public.liability
  (user_id, type, total, paid, remaining_principal, fee, next_repay_date, status)
select '3a4c9ead-24ff-468c-b259-e0a5e28ba2c9'::uuid,
       v.t, v.total, v.paid, v.remaining, v.fee, v.due::date, v.st
from (values
  ('white_bar',     5823.96, 2223.96, 3600, 19.44, '2026-11-25', 'deferred'),
  ('installment',   5784.00, 1687.00, 4097,  0.00, '2026-11-15', 'normal'),
  ('monthly_fixed',    81.00,    0.00,   81,  0.00, '2026-11-01', 'normal')
) as v(t, total, paid, remaining, fee, due, st)
where not exists (
  select 1 from public.liability l
  where l.user_id = '3a4c9ead-24ff-468c-b259-e0a5e28ba2c9'::uuid
    and l.type = v.t
    and l.total = v.total
);

-- ------------------------------------------------------------
-- 第 5 段：11 月已知还款账单（不与月固定开支重复）
-- 11.25 白条 3619.44 = 剩余本金 3600 + 延期手续费 19.44
-- ------------------------------------------------------------
insert into public.repayment_event (user_id, due_date, amount)
select '3a4c9ead-24ff-468c-b259-e0a5e28ba2c9'::uuid, v.due::date, v.amt
from (values
  ('2026-11-15',  241.00),
  ('2026-11-25', 3619.44)
) as v(due, amt)
where not exists (
  select 1 from public.repayment_event r
  where r.user_id = '3a4c9ead-24ff-468c-b259-e0a5e28ba2c9'::uuid
    and r.due_date = v.due::date
    and r.amount = v.amt
);

-- ------------------------------------------------------------
-- 第 6 段：待收收入（未到账，不计入余额）
-- ------------------------------------------------------------
insert into public.pending_income (user_id, type, est_amount, status, condition)
select '3a4c9ead-24ff-468c-b259-e0a5e28ba2c9'::uuid,
       v.t, v.amt, v.st, v.cond
from (values
  ('学校奖项奖金', 2000.00, 'unreceived',
   '10 月中旬申报；到账后按实数修改并计入现金'),
  ('应届生社保补贴（小微企业吸纳）', cast(null as numeric), 'reviewing',
   '金额待确认（江汉区人社局）；条件：小微企业就业 + 1 年以上劳动合同 + 连续缴满 6 月社保'),
  ('武汉人社补贴 7-9 月', 352.72, 'reviewing',
   '基数 470.29 × 25% × 3；最长可领 12 个月，后续 9 个月约 1058.13')
) as v(t, amt, st, cond)
where not exists (
  select 1 from public.pending_income p
  where p.user_id = '3a4c9ead-24ff-468c-b259-e0a5e28ba2c9'::uuid
    and p.type = v.t
);

-- ------------------------------------------------------------
-- 第 7 段：待办（来自 baseline 风险提示）
-- ------------------------------------------------------------
insert into public.todo (user_id, title, related_repay_date, status)
select '3a4c9ead-24ff-468c-b259-e0a5e28ba2c9'::uuid,
       v.title, v.due::date, 'open'
from (values
  ('确认 11.25 白条 3619.44 的资金是否到位', '2026-11-25'),
  ('共享单车月卡 11.16 到期需重购',          '2026-11-16'),
  ('转正薪资沟通：基准 5000 / 申请 6000 / 折中 5500 待 HR', cast(null as date)),
  ('应届生社保补贴申报（江汉区人社局）',      cast(null as date))
) as v(title, due)
where not exists (
  select 1 from public.todo t
  where t.user_id = '3a4c9ead-24ff-468c-b259-e0a5e28ba2c9'::uuid
    and t.title = v.title
);

-- ------------------------------------------------------------
-- 第 8 段：执行后核对（只读）
-- 期望：薪资 1 条 / 开支 4 条 / 负债 3 笔 / 还款 2 笔 / 待收 3 项 / 待办 4 条
-- ------------------------------------------------------------
select '薪资版本'     as 项目, count(*) as 行数 from public.salary_config    where user_id = '3a4c9ead-24ff-468c-b259-e0a5e28ba2c9'::uuid
union all select '月固定开支', count(*) from public.expense_category  where user_id = '3a4c9ead-24ff-468c-b259-e0a5e28ba2c9'::uuid
union all select '负债',       count(*) from public.liability        where user_id = '3a4c9ead-24ff-468c-b259-e0a5e28ba2c9'::uuid
union all select '还款账单',   count(*) from public.repayment_event  where user_id = '3a4c9ead-24ff-468c-b259-e0a5e28ba2c9'::uuid
union all select '待收收入',   count(*) from public.pending_income   where user_id = '3a4c9ead-24ff-468c-b259-e0a5e28ba2c9'::uuid
union all select '待办',       count(*) from public.todo            where user_id = '3a4c9ead-24ff-468c-b259-e0a5e28ba2c9'::uuid;

-- ------------------------------------------------------------
-- 执行后还需在前端完成 / 或由 0004 迁移落库
-- 以下三项是「当前余额 / 每月固定还款 / 年内历史薪资」，已改由迁移 0004_backend_prefs.sql
-- 落到 profiles 表 + balance_log 表（不再只存前端 localStorage）。0004 已为已知账号预置
-- 465 / 241 / 7-10 月历史薪资；其它新账号首次在前端填写后会自动上传后端。
-- 4. 档案配置 → 「变更档案」确认 4 个社保基数与起征点
-- ------------------------------------------------------------
