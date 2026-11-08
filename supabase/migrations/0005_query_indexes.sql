-- ============================================================
-- 0005 · 补关键查询索引
-- 背景：前端每条查询都 eq('user_id', uid)（stores/app.js），而 0001 仅
--       profiles 有主键索引，其余业务表无 user_id 索引，随数据增长会
--       退化为全表顺序扫描。另：agnes-proxy 限流按 user_id + created_at
--       计数，ai_interaction_log 也需该复合索引。
-- 幂等：create index if not exists，可重复执行、无破坏性。
-- 不破坏既有结构、不动 RLS、不删数据。
-- ============================================================

create index if not exists transaction_user_txn_idx
  on public.transaction (user_id, txn_date);

create index if not exists repayment_event_user_idx
  on public.repayment_event (user_id, due_date);

create index if not exists liability_user_idx
  on public.liability (user_id);

create index if not exists pending_income_user_idx
  on public.pending_income (user_id);

create index if not exists todo_user_idx
  on public.todo (user_id);

create index if not exists salary_config_user_idx
  on public.salary_config (user_id);

create index if not exists expense_category_user_idx
  on public.expense_category (user_id);

create index if not exists ai_interaction_log_user_created_idx
  on public.ai_interaction_log (user_id, created_at);
