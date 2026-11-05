-- ============================================================
-- 现金流安全垫 · 产品初始化迁移 (v1.1)
-- 执行方式：Supabase SQL Editor 粘贴执行，或 `supabase db push`
-- 说明：含日历引擎表 holiday_calendar、profiles.work_schedule
--       RLS 强制多租户隔离；保险/节假日为全局表（认证用户可读，写由运营 service_role）
-- ============================================================

create extension if not exists "pgcrypto";

-- ---------------- 1. profiles（用户基础参数） ----------------
create table if not exists public.profiles (
  user_id          uuid primary key references auth.users(id) on delete cascade,
  username         text not null unique,   -- 登录用户名（唯一），底层邮箱用 用户名@paytrace.local 别名
  city             text not null default '武汉江汉区',
  hire_date        date,
  pay_day          smallint not null default 15 check (pay_day between 1 and 31),
  pay_adjust_rule  text not null default 'advance' check (pay_adjust_rule in ('advance','postpone','keep')),
  repay_adjust_rule text not null default 'postpone' check (repay_adjust_rule in ('advance','postpone','keep')),
  tax_threshold    numeric(12,2) not null default 5000,
  work_schedule    text not null default 'double' check (work_schedule in ('double','single')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ---------------- 2. salary_config（薪资/社保基数三套） ----------------
create table if not exists public.salary_config (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  phase               text not null check (phase in ('probation','regular')),
  pre_tax_salary      numeric(12,2) not null,
  sb_base_pension     numeric(12,2) not null,   -- 养老基数
  sb_base_medical     numeric(12,2) not null,   -- 医疗/失业基数
  sb_base_unemploy    numeric(12,2) not null,   -- 同医疗基数（保留字段便于差异化）
  sb_base_fund        numeric(12,2) not null,   -- 公积金基数
  created_at          timestamptz not null default now()
);

-- ---------------- 3. insurance_rule（城市社保/公积金模板，全局） ----------------
create table if not exists public.insurance_rule (
  id          uuid primary key default gen_random_uuid(),
  city        text not null,
  item        text not null,                    -- 养老/医疗/失业/公积金/大额医疗/工伤/生育
  party       text not null check (party in ('personal','company')),
  category    text not null check (category in ('rate','fixed')),
  rate        numeric(6,4) default 0,           -- 比例（小数）
  amount      numeric(12,2) default 0,          -- 固定金额
  base_label  text,                             -- 基数类别说明
  calc_basis  text,                             -- 计算依据
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ---------------- 4. holiday_calendar（日历引擎，全局） ----------------
create table if not exists public.holiday_calendar (
  id            uuid primary key default gen_random_uuid(),
  holiday_date  date not null unique,
  day_type      text not null check (day_type in ('rest','legal_holiday','makeup_workday')),
  year          int not null,
  note          text,
  created_at    timestamptz not null default now()
);

-- ---------------- 5. expense_category（月固定开支） ----------------
create table if not exists public.expense_category (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  name           text not null,
  monthly_amount numeric(12,2) not null default 0,
  deduct_day     smallint not null default 1 check (deduct_day between 1 and 31),
  created_at     timestamptz not null default now()
);

-- ---------------- 6. liability（负债） ----------------
create table if not exists public.liability (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  type                text not null check (type in ('installment','white_bar','monthly_fixed')),
  total               numeric(12,2) default 0,
  paid                numeric(12,2) default 0,
  remaining_principal numeric(12,2) default 0,
  fee                 numeric(12,2) default 0,
  next_repay_date     date,
  status              text not null default 'normal' check (status in ('normal','deferred','cleared','overdue')),
  created_at          timestamptz not null default now()
);

-- ---------------- 7. repayment_event（还款日历明细，由 liability 派生） ----------------
create table if not exists public.repayment_event (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  liability_id   uuid references public.liability(id) on delete cascade,
  due_date       date not null,
  amount         numeric(12,2) not null,
  status         text not null default 'pending' check (status in ('pending','reminding','paid','overdue')),
  created_at     timestamptz not null default now()
);

-- ---------------- 8. transaction（流水） ----------------
create table if not exists public.transaction (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  txn_date   date not null,
  direction  text not null check (direction in ('income','expense')),
  category   text not null,
  amount     numeric(12,2) not null check (amount > 0),
  note       text,
  source     text not null default 'manual' check (source in ('manual','ai')),
  created_at timestamptz not null default now()
);

-- ---------------- 9. pending_income（待收收入） ----------------
create table if not exists public.pending_income (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  type        text not null,
  est_amount  numeric(12,2),
  status      text not null default 'unreceived' check (status in ('unreceived','reviewing','received','void')),
  condition   text,
  created_at  timestamptz not null default now()
);

-- ---------------- 10. todo（待办） ----------------
create table if not exists public.todo (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  title              text not null,
  related_repay_date date,
  status             text not null default 'open' check (status in ('open','done')),
  created_at         timestamptz not null default now()
);

-- ---------------- 11. ai_interaction_log（AI 交互日志，反馈闭环） ----------------
create table if not exists public.ai_interaction_log (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  action       text not null check (action in ('parse_note','advise_purchase')),
  raw_input    text,
  parsed_json  jsonb,
  confidence   numeric(4,3),
  accepted     boolean,
  model_version text,
  created_at   timestamptz not null default now()
);

-- ============================================================
-- RLS：用户自有表强制多租户隔离
-- ============================================================
alter table public.profiles          enable row level security;
alter table public.salary_config     enable row level security;
alter table public.expense_category  enable row level security;
alter table public.liability         enable row level security;
alter table public.repayment_event   enable row level security;
alter table public.transaction       enable row level security;
alter table public.pending_income    enable row level security;
alter table public.todo              enable row level security;
alter table public.ai_interaction_log enable row level security;

-- 用户自有表：仅本人可读写
create policy "own profiles"          on public.profiles          for all using (auth.uid()=user_id) with check (auth.uid()=user_id);
create policy "own salary_config"     on public.salary_config     for all using (auth.uid()=user_id) with check (auth.uid()=user_id);
create policy "own expense_category"  on public.expense_category  for all using (auth.uid()=user_id) with check (auth.uid()=user_id);
create policy "own liability"         on public.liability         for all using (auth.uid()=user_id) with check (auth.uid()=user_id);
create policy "own repayment_event"   on public.repayment_event   for all using (auth.uid()=user_id) with check (auth.uid()=user_id);
create policy "own transaction"       on public.transaction       for all using (auth.uid()=user_id) with check (auth.uid()=user_id);
create policy "own pending_income"    on public.pending_income    for all using (auth.uid()=user_id) with check (auth.uid()=user_id);
create policy "own todo"              on public.todo              for all using (auth.uid()=user_id) with check (auth.uid()=user_id);
create policy "own ai_interaction_log" on public.ai_interaction_log for all using (auth.uid()=user_id) with check (auth.uid()=user_id);

-- 全局表：认证用户可读，写由 service_role（运营后台）负责
alter table public.insurance_rule    enable row level security;
alter table public.holiday_calendar  enable row level security;
create policy "read insurance_rule"   on public.insurance_rule   for select using (true);
create policy "read holiday_calendar" on public.holiday_calendar for select using (true);

-- ============================================================
-- 新用户自动建 profiles
-- ============================================================
create or replace function public.handle_new_user()
returns trigger as $$
begin
  -- 注册时由前端通过 options.data.username 传入，写入唯一用户名
  insert into public.profiles (user_id, username)
  values (new.id, new.raw_user_meta_data->>'username');
  return new;
end; $$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- 初始数据：武汉江汉区 2026 社保/公积金模板（源自 product_baseline.json 真实口径）
-- 注意：上线后运营可维护其他城市；多租户用户不得以此为他人默认值
-- ============================================================
insert into public.insurance_rule (city, item, party, category, rate, amount, base_label, calc_basis) values
  ('武汉江汉区','养老','personal','rate',0.08,0,'养老基数4552','基数×8%'),
  ('武汉江汉区','职工基本医疗保险','personal','rate',0.02,0,'医疗/失业基数4498','基数×2%'),
  ('武汉江汉区','大额医疗费用补助','personal','fixed',0,7,'固定','每月固定7元'),
  ('武汉江汉区','失业','personal','rate',0.003,0,'医疗/失业基数4498','基数×0.3%'),
  ('武汉江汉区','公积金','personal','rate',0.08,0,'公积金基数2400','基数×8%'),
  ('武汉江汉区','养老','company','rate',0.16,0,'养老基数4552','基数×16%'),
  ('武汉江汉区','医疗','company','rate',0.08,0,'医疗/失业基数4498','基数×8%'),
  ('武汉江汉区','失业','company','rate',0.007,0,'医疗/失业基数4498','基数×0.7%'),
  ('武汉江汉区','工伤','company','rate',0.006,0,'医疗/失业基数4498','基数×0.6%'),
  ('武汉江汉区','公积金','company','rate',0.08,0,'公积金基数2400','基数×8%')
on conflict do nothing;

-- ============================================================
-- 初始数据：2026 双休基础日历（周六/周日记 rest）
-- 法定节假日(legal_holiday) 与 调休补班日(makeup_workday) 由运营按国务院公布安排补全
-- 风险提示：本脚本仅保证双休判定正确，法定节假日/调休须人工维护（见 RK-06）
-- ============================================================
insert into public.holiday_calendar (holiday_date, day_type, year, note)
select d, 'rest', 2026, '双休基础（运营需补充法定节假日与调休补班日）'
from generate_series('2026-01-01'::date, '2026-12-31'::date, '1 day') d
where extract(dow from d) in (0,6)
on conflict (holiday_date) do nothing;
