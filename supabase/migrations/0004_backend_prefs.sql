-- ============================================================
-- 0004 · 把三类「仅存前端 localStorage」的关键数据迁移到后端
-- 背景：当前余额(20) / 每月固定还款(241) / 年内历史薪资(7-10月)
--       此前只存浏览器，换设备 / 清缓存即丢，且不满足「数据都在后端」。
-- 做法：
--   1) profiles 增加 current_balance / recurring_repayment / salary_ytd 三列
--   2) 新建 balance_log 表承载「余额变动台账」（append-only，RLS 隔离）
--   3) 把已知账号(3a4c9ead...)的前端初值直接落库，立即可在后端查到
-- 幂等：add column if not exists / create table if not exists / update 定值可重跑
-- 不破坏既有结构、不动 RLS、不删数据。
-- ============================================================

-- ---------------- 1. profiles 增加三列 ----------------
alter table public.profiles
  add column if not exists current_balance    numeric(12,2),
  add column if not exists recurring_repayment numeric(12,2),
  add column if not exists salary_ytd         jsonb;

-- ---------------- 2. balance_log（余额变动台账，append-only） ----------------
create table if not exists public.balance_log (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  changed_at    timestamptz not null default now(),
  balance_date  date,
  from_amount   numeric(12,2),
  to_amount     numeric(12,2),
  delta         numeric(12,2),
  reason        text,
  kind          text not null default 'update' check (kind in ('baseline','update'))
);

create index if not exists balance_log_user_idx on public.balance_log (user_id, changed_at);

alter table public.balance_log enable row level security;
-- policy 不支持 if not exists，先删后建，保证可重复执行
drop policy if exists "own balance_log" on public.balance_log;
create policy "own balance_log" on public.balance_log
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------- 3. 现有账号初值落库 ----------------
-- 注意：不写死某个 user_id。这是个人应用，直接给所有 profile 填上用户自报的真实值；
-- 这样无论用户用哪个账号（注册账号 / 触发器自动建的行）登录都能读到，避免此前写死 UUID 漏掉真实账号。
-- 仅对尚未填过这些列的账号生效，不覆盖用户已主动设过的值。
update public.profiles set
  current_balance     = coalesce(current_balance, 20),
  recurring_repayment = coalesce(recurring_repayment, 241),
  salary_ytd          = coalesce(
    salary_ytd,
    '[
      {"month":7,"preTax":0,"insuranceTotal":0},
      {"month":8,"preTax":4000,"insuranceTotal":716.29},
      {"month":9,"preTax":4000,"insuranceTotal":720.61},
      {"month":10,"preTax":4000,"insuranceTotal":720.61}
    ]'::jsonb
  )
where current_balance is null
   or recurring_repayment is null
   or salary_ytd is null;

-- ---------------- 4. 执行后核对（只读） ----------------
select
  coalesce(current_balance, -1)      as 当前余额,
  coalesce(recurring_repayment, -1)  as 每月固定还款,
  case when salary_ytd is not null then jsonb_array_length(salary_ytd) else -1 end as 历史薪资月数
from public.profiles
where user_id = '3a4c9ead-24ff-468c-b259-e0a5e28ba2c9'::uuid;
