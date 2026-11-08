-- ============================================================
-- 现金流安全垫 · 增量迁移 v1.2（在 0001_init.sql 之后执行）
-- 1) analytics_event：PRD 第十章 7 个埋点事件（RLS 仅本人可见）
-- 2) liability.monthly_payment：分期剩余期数推导所需月供，落库可被多端复用
-- 说明：本文件为增量迁移，不含破坏性清理，可重复执行（if not exists）。
-- ============================================================

-- ---------------- 1. 埋点事件 ----------------
create table if not exists public.analytics_event (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  event       text not null check (event in (
    'register_complete',
    'param_saved',
    'ai_note_created',
    'repayment_reminder_sent',
    'scenario_switched',
    'cashflow_negative_viewed',
    'holiday_adjusted'
  )),
  payload     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists analytics_event_user_time_idx
  on public.analytics_event (user_id, created_at desc);

alter table public.analytics_event enable row level security;

-- 个人用户仅可写自己、读自己；无 update / delete，埋点只追加
drop policy if exists "own analytics_event insert" on public.analytics_event;
create policy "own analytics_event insert" on public.analytics_event
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "own analytics_event select" on public.analytics_event;
create policy "own analytics_event select" on public.analytics_event
  for select to authenticated using (auth.uid() = user_id);

-- ---------------- 2. 负债月供（剩余期数推导） ----------------
-- 旧库若已跑过 0001_init.sql，用 add column if not exists 平滑补列
alter table public.liability
  add column if not exists monthly_payment numeric(12,2);

comment on column public.liability.monthly_payment is
  '每期月供（元）。用于由 remaining_principal 自动推导剩余期数与生成还款账单；为空则回落到本机「每月固定还款」偏好。';
