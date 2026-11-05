# 对话交接文档 · 现金流安全垫（薪资现金流管理 Web 项目）

> 用途：本对话已结束，此文档供**下一个对话/会话**零歧义接手。
> 最后更新：**2026-11-04**（本轮收尾，覆盖 11-03 版；11-03 版多处结论已过时，以本版为准）
> 项目根目录（绝对路径）：`C:\Users\2041622796\Desktop\paytrace`
> （此前误建在 WorkBuddy 沙盒 `2026-11-03-19-58-22`，已整体搬迁，沙盒副本为重复可删）

## 0. 当前状态速览（先读这段）

- **前端代码线：已完成并反复验证**。`npm run verify` 37/37、`npm run build` 零警告、CDP 375px 真机视口 6 个页面零运行时异常 / 零组件漏注册 / 无横向溢出。功能覆盖：登录、深浅主题、档案版本化、三级缓存、多月前瞻、流水账本、月度对账、数据体检、待收收入、负债清单、目标安全垫、AI 记账、全量备份导出。
- **Supabase 侧：大部分已通，剩余确认项见 §16**。已观察到的事实：库表已建且可读写（用户成功插入 1/3/1 测试数据）、用户可登录（`xy@paytrace.local`）、`agnes-proxy` 探测返回 401 而非 404（函数已部署）。**未确认**：`profiles.username` 增量补丁是否执行（曾报 `42703 column "username" does not exist`）、`Confirm email` 是否关闭、`AGNES_API_KEY` secret 是否设置。
- **本对话所有浏览器验证均使用模拟会话**，只证明「页面渲染 + 零异常」，**未验证过真实账号的登录 → 读库 → 写库全链路**。这是当前最大的未闭环项。
- **真实数据已落库（用户已确认，2026-11-04）**：`profiles.username` 增量补丁与 `supabase/0002_real_data_seed.sql` 均执行成功。库内为 baseline 真实口径（税前 5000、月固定开支 1179、11.25 白条 3619.44）。本机参数可用「数据体检 → 按基准数据预填」一键写入，但仍需对照工资条核对。
- **明文 `AGNES_API_KEY` 已从本文件与 `functions/agnes-proxy/README.md` 删除**，全项目扫描无 `sk-` 残留；但**密钥轮换需用户在 agnes 控制台操作，尚未完成**，历史值应视为已泄露。

---

## 1. 一句话定位
把桌面 Excel《个人薪资现金流管理表 V7》产品化成 Web 端「现金流安全垫」工具：多租户、现金流预测 + 还款预警 + 多薪资情景模拟 + AI 自然语言记账/购物劝导。面向新入职、现金流紧张人群，强调"现金流安全"而非普通记账。

## 2. 技术栈（已定，勿改方向）
- **前端**：Vue 3 + Vite + vue-router（hash 模式）+ **Pinia（状态管理）** + Naive UI（主题橙 `#FF6B35`）+ ECharts + `@supabase/supabase-js`
- **后端**：Supabase（Postgres + Auth + RLS 多租户隔离 + Edge Functions）
- **AI**：`agnes-3.0-flash`，**经 Edge Function `agnes-proxy` 服务端代理调用**（密钥只在 Supabase Secrets，绝不落地前端）
- **部署**：前端 Vercel / 静态托管；后端 Supabase 云
- 依赖版本：`vue ^3.4.31` / `pinia ^2.3.1`（npm install 实际解析值）/ `vite ^5.3.3` / `@supabase/supabase-js ^2.43.4`

## 3. 目录与关键文件
```
paytrace/
├─ CONVERSATION_HANDOFF.md         # 本文件
├─ product_baseline.json           # 真实数据语义化基准（武汉江汉区社保口径、字段含义）
├─ 薪资现金流管理产品_PRD.md        # PRD v1.2（FR-01~17、风险卡、扩展想象池）
├─ 个人薪资现金流管理表V7.xlsx      # 原始需求来源
├─ supabase/
│  ├─ migrations/0001_init.sql     # 11 张表 + RLS + 武汉社保模板 + 2026 双休日历 + 新用户触发器
│  └─ functions/agnes-proxy/index.ts # Edge Function（parse_note / advise_purchase + 交互日志）
└─ frontend/
   ├─ .env                         # ✅ 已建并填好 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
   ├─ .env.example
   ├─ src/main.js                  # createApp + createPinia + router + naive + 启动初始化 auth
   ├─ src/App.vue                  # n-config-provider > n-message-provider > n-dialog-provider > router-view
   ├─ src/router/index.js          # 嵌套布局 + 登录守卫（getSession）
   ├─ src/lib/supabase.js          # Supabase 客户端 + callAgnes()
   ├─ src/lib/holidays2026.js      # 2026 官方节假日/调休静态表（FR-15/16/17）
   ├─ src/composables/useCashflow.js # 纯函数引擎 calcNetSalary / computeCashflow（不持有状态）
   ├─ src/stores/auth.js           # ✅ 登录态集中管理（本轮新增）
   ├─ src/stores/app.js            # ✅ 业务配置集中存储、跨页响应式（本轮新增）
   ├─ src/components/{AppLayout,CashflowTimeline}.vue
   └─ src/views/{Login,Dashboard,Settings,AINote,Todo}.vue
```

## 4. 变更记录

### 4.1 基线（2026-11-03，保留背景）
- PRD v1.2、后端底座 `0001_init.sql`、`agnes-proxy`、前端 5 页骨架 + ECharts 多情景曲线、`holidays2026.js` 日历引擎。
- 修过：还款事件 `lte('due_date','YYYY-MM-31')` 在 2/4/6/9/11 月越界、未配薪资时 `netNow` 显示 undefined、`expense_category.deduct_day` 允许 NULL 致静默丢开支。

### 4.2 本轮（2026-11-04）全部改动 — **已验证**

**A. 接入真实 Supabase（前端侧）**
- 新建 `frontend/.env`，填入用户提供的 `VITE_SUPABASE_URL`（项目 ref `kfgcrtloejtwiehbyoqi`）+ anon key。
- 验证：`vite build` 产物内可 grep 到项目 ref（确认注入）；anon key 读 `profiles` 返回 `PGRST205`（表缺失，非 401）→ key 有效、项目可达；dev server HTTP 200 无启动告警。

**B. 用户名 + 密码登录（免邮箱验证）** — 用户明确要求：不想要邮箱验证、用户名唯一
- 方案：Supabase Auth 底层身份只能是 email，故用 **`用户名@paytrace.local` 内部别名**，用户只感知用户名。RLS / `auth.uid()` / 所有业务表一行未改。
- `0001_init.sql`：`profiles` 加 `username text not null unique`；`handle_new_user()` 触发器从注册 metadata `options.data.username` 写入用户名（唯一约束兜底防重名）。
- `Login.vue`：邮箱输入 → 用户名输入；登录/注册统一映射别名；注册传 metadata；重名给出可读提示。
- **需用户在 Dashboard 点一个开关**：Authentication → Providers → Email → 取消 **Confirm email**（含 Double confirm）→ Save。关掉后注册即自动登录、不发验证邮件。

**C. 修 3 个运行时 bug**
1. `App.vue` 缺 `n-message-provider` → Dashboard 的 `useMessage()` 在 setup 抛错、组件崩溃。已补 `n-message-provider` + `n-dialog-provider` 包住 `<router-view>`。
2. `AppLayout.vue` 侧边栏显示 `xxx@paytrace.local` 别名 → 改为显示剥离后缀的干净用户名（现由 `auth.username` getter 提供）。
3. `AINote.vue` AI 记账方向枚举：`agnes-proxy` 按系统提示词返回中文 `收入/支出`，但 `transaction.direction` 的 SQL check 是 `('income','expense')`，直接落库会约束失败。`confirmWrite()` 已加映射 `收入→income`、`支出→expense`。**另**修展示层第 19 行原用 `=== 'income'` 判断，会把中文「收入」误显示成「支出」，已改为兼容中英文。

**D. 引入 Pinia（用户问"怎么没用 pinia"后确认要做）**
- 背景：README 曾写"挂载 pinia"但**从未真正安装/接入**；原状态靠纯函数 composable + 各视图本地 `ref` + 各页重复 `getUser()`。最实在的痛点是 **Settings 保存后 Dashboard 不自动刷新**。
- `src/stores/auth.js`：集中登录态。`toLoginEmail` / `stripAlias` 别名逻辑内聚于此；getter `userId / username / isAuthenticated / email`；action `login / register / logout / ensureReady`（幂等，整个生命周期只拉一次，附 `onAuthStateChange` 监听）。
- `src/stores/app.js`：集中 `profiles / salaryConfig / expenses / repayments`。`load()` + `saveProfile / saveSalary / addExpense / delExpense / addRepayment / delRepayment`，**每个 action 同时写 Supabase 与本地 state** → Settings 保存即更新 store → Dashboard `computed` 自动重算，无需退出重进。
- `main.js`：`app.use(createPinia())`，`app.mount` 后调 `useAuthStore().ensureReady()`。
- 视图重构：`Login.vue`（走 auth store）、`AppLayout.vue`（用 `auth.username`）、`Dashboard.vue`（用 app store，当月还款在前端 `filter(due_date.startsWith(year-ms))`）、`Settings.vue`（用 app store，表格绑 `app.expenses`）、`AINote.vue`/`Todo.vue`（用 `auth.userId`）。
- `useCashflow.js` **保持纯函数不动**（本就不需要变 store）。

**E. 数据持久化核查结论（纠正 11-03 版错误）**
> 旧文档 §6 写"Settings 当前前端只读，无写路径"——**不成立，勿沿用**。实际已实现且走 Supabase + RLS：
- `Settings.vue`：`profiles` upsert、`salary_config` 增改、`expense_category` 增删
- `Todo.vue`：`todo` 表完整增/改/删
- `AINote.vue`：AI 解析后写 `transaction`
- `Dashboard.vue`：读 4 张配置表渲染曲线
- **唯一真缺口**：`repayment_event` 无 UI 写入口（store 已备好 `addRepayment/delRepayment`，Settings 未接表单），目前只能靠 SQL 注入（见 §6 D）。
- **故意不持久化**：Dashboard 的「期初余额」「转正假设薪资」是本地 `ref`，刷新重置（MVP 标注过的简化项）。

**F. 验证结果（本轮最后一次）**
- `npm run build` ✅ 通过（含 AINote 展示 bug 修复后重跑，17.72s）
- `npm run dev` ✅ HTTP 200、无启动报错
- 仅有 Vite 的 chunk >500kB 提示（Naive UI / ECharts 全量引入），非错误，生产可按需引入优化

---

## 5. ⚠️ 关键坑（下一位接手必读，避免重复踩）

1. **迁移幂等性 / `username` 补列（最容易卡住注册）**
   `0001_init.sql` 用 `create table if not exists`——**对已存在的旧版 `profiles` 表不会补加 `username` 列**；且脚本内 `create policy` 无 `drop policy if exists`，**整份重跑会报 policy 已存在**。
   - 全新空库：直接跑一次 `0001_init.sql` 即可。
   - 已跑过旧版迁移的库：**不要整份重跑**，改用下方补丁补列（§6 B）。否则触发器 insert `username` 会因列不存在而失败 → 注册直接报错。
2. **`profiles.username not null` 与旧账号**：若库里存在早期用真实邮箱注册的账号，其 `profiles` 行没有 username。补列后需回填再设 `not null`，否则 alter 失败。
3. **登录 400（`auth/v1/token?grant_type=password`）**：凭证无效。多半是**旧邮箱账号残留**与新的 `@paytrace.local` 别名对不上，或 Confirm email 没关。排查：Dashboard → Authentication → Users 看账号形态；旧账号删掉重新用用户名注册。浏览器若停在旧 session，先「退出登录」清掉再登录。
4. **`PGRST205`（表不在 schema cache）≠ 401**：说明 key 有效、表没建，是迁移未跑的正常表现，不要当成鉴权失败去查 key。
5. **AI 方向枚举**：任何新增写 `transaction` 的路径，方向必须是英文 `income/expense`；AI 返回的是中文，必须映射。
6. **别名后缀**：任何展示用户身份的地方都要剥掉 `@paytrace.local`，统一用 `auth.username`。
7. **敏感信息**：`AGNES_API_KEY` 只存 Supabase Secrets，任何仓库文件与交接文档都不得出现明文值；若曾写入过，立即删除并在 agnes 侧轮换。前端 `.env` 只有 anon key（公开、受 RLS 保护）。

---

## 6. Supabase 侧操作清单（历史步骤，当前状态见 §0 / §16）

### B. 跑迁移
Supabase Dashboard → SQL Editor → 粘贴执行 `supabase/migrations/0001_init.sql` **全量一次**。
> 脚本只建 2026 双休基础日历，法定节假日/调休补班需运营补全（RK-06），不影响联调。

**若该库此前已跑过旧版迁移（无 `username` 列），改用下方完整补丁，不要整份重跑**（整份重跑会在 `create policy` 处报 already exists 并回滚；`create table if not exists` 也不会给已存在的表补列）。

> 已实证：本库查询 `select user_id, username, pay_day from public.profiles` 返回 `42703: column "username" does not exist`，属于这种情况。补丁是否执行**尚未确认**，见 §16。

```sql
-- ① 补列（旧库可能同时缺 work_schedule）
alter table public.profiles add column if not exists username text;
alter table public.profiles add column if not exists work_schedule text not null default 'double';

-- ② 回填：xy@paytrace.local → xy
update public.profiles p
set username = split_part(u.email, '@', 1)
from auth.users u
where u.id = p.user_id and p.username is null;

-- ③ 兜底：email 为空时给唯一短码，保证 not null 能设上
update public.profiles
set username = 'user_' || substr(user_id::text, 1, 8)
where username is null or username = '';

-- ④ 若账号压根没有 profiles 行（旧触发器未执行），补一行
insert into public.profiles (user_id, username)
select u.id,
       coalesce(nullif(u.raw_user_meta_data->>'username', ''),
                nullif(split_part(u.email, '@', 1), ''),
                'user_' || substr(u.id::text, 1, 8))
from auth.users u
where not exists (select 1 from public.profiles p where p.user_id = u.id);

-- ⑤ 唯一 + 非空
create unique index if not exists profiles_username_key on public.profiles (username);
alter table public.profiles alter column username set not null;

-- ⑥ 重建触发器：必须写 username，否则设了 not null 后新用户注册会失败
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (user_id, username)
  values (new.id,
          coalesce(nullif(new.raw_user_meta_data->>'username', ''),
                   nullif(split_part(new.email, '@', 1), '')));
  return new;
end; $$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

⑤ 若报 `23505` 唯一冲突，说明存在多个邮箱前缀相同的账号（如 `xy@gmail.com` 与 `xy@paytrace.local`）。先 `select user_id, username from public.profiles;` 查看，删掉早期不用的账号再重跑。

验证：`select user_id, username, pay_day, work_schedule from public.profiles;` 期望 `xy | 15 | double`。

### B2. 关邮箱验证（用户名登录的前提）
Authentication → Providers → Email → 取消 **Confirm email**（及 Double confirm email）→ Save。

### C. 部署 Edge Function + 密钥（唯一未部署的后端件）
```bash
supabase login
supabase functions deploy agnes-proxy
supabase secrets set AGNES_API_KEY="<从 agnes 控制台获取>"
```
- Base URL `https://api.agnes-ai.cn/v1/chat/completions`、模型 `agnes-3.0-flash` 已在 `agnes-proxy/index.ts` 内写死/`AGNES_API_URL` 可覆盖；函数名必须是 `agnes-proxy`（前端 `callAgnes` 拼的是 `/functions/v1/agnes-proxy`）。
- Edge Function 会自行注入 `SUPABASE_URL` / `SUPABASE_ANON_KEY`；用 `getUser(jwt)` 校验登录态后写 `ai_interaction_log`。
- 或走 Dashboard：Edge Functions → New Function → 粘贴 `index.ts` 命名 `agnes-proxy` → Secrets 里设 `AGNES_API_KEY`。
- **密钥获取**：登录 agnes 控制台生成，只写入 Supabase Secrets；任何仓库文件、交接文档都不得出现明文。历史版本曾写入过明文，视为已泄露，**请在 agnes 控制台轮换该密钥**（2026-11-04 已从本文件与 `functions/agnes-proxy/README.md` 删除）。

### D. 灌入真实业务数据（**旧测试数据段已废弃**）
执行 `supabase/0002_real_data_seed.sql`：8 段、幂等、零 DDL、不动 RLS，全部语句严格限定 `user_id = '3a4c9ead-24ff-468c-b259-e0a5e28ba2c9'`。内容：清理 5 条测试数据 → 档案（入职 2026-07-13、发薪 15、起征点 5000）→ 薪资版本（税前 5000，基数 4552/4498/4498/2400）→ 月固定开支 1179 → 3 笔负债 → 11 月两笔账单（15 日 241、25 日 3619.44）→ 3 项待收 → 4 条待办 → 计数核对。

> **执行前先到「数据体检」页点「导出全量备份」**；第 0 段是破坏性清理，可单独跳过。
> **两个已明示的判断**：① 转正税前按 baseline 的 5000（6000 为「申请待 HR 确认」）；② 月固定开支只放 1179，手机分期 241 与白条 3619.44 走还款日历，避免重复扣款。
> **SQL 由用户在 SQL Editor 执行，本对话不代执行、未执行过。**

**废弃说明**：原先此处的 `with u as (...)` 三段式测试 SQL 有 CTE 作用域 bug —— CTE 只作用于紧随其后的第一条 INSERT，第 2、3 条的 `from u` 必然报 `42P01: relation "u" does not exist`；且后两条没有去重，补跑会插入重复行导致金额翻倍。用户已实际踩过，勿再使用。

**本机偏好现已支持一键预填**：「数据体检 → 按基准数据预填」（预览 → 确认两步）写入期初余额 465、每月固定还款 241、年内历史薪资（8/9/10 月，五险一金含每月 54 元补差；7 月不发薪留空）。预填只写 localStorage、不改数据库，且**绝不覆盖已填值**。仍需人工核对 4 个社保基数与工资条。

### E. 全链路验收（**尚未做过，当前最高优先级**）
`cd frontend && npm run dev` → 硬刷新（Ctrl+Shift+R）→ **用真实账号登录**，逐项验：
1. 仪表盘读出的是真实数据（税前 5000、月固定开支 1179、11/25 白条 3619.44），不是测试数据的 6000 / 1500 / 800；
2. 「档案配置」改工资后**不刷新直接回仪表盘应自动变**（Pinia 联动 + 缓存同步）；
3. 「流水账本」记一笔 / 切月份 / 搜索 / CSV 导出 / 强制刷新；
4. 「标记到账」两步写一致性（有流水且状态已改，不留半截数据）；
5. 「智能记账」AI 解析 → 草稿清单 → 逐条编辑 / 删除 / 手动新增 → 勾选 → 单条或批量写入 `transaction`（方向必须是英文 `income/expense`，来源 `ai`/`manual`），验证 `AGNES_API_KEY` secret 是否设好；若已重新部署 `agnes-proxy`，再试「午饭45，打车23」应解析出 2 笔；
6. 深浅主题切换、375px 底部导航、数据体检扫描、全量备份导出。

> 此前所有 CDP 浏览器验证均使用**模拟会话**，只覆盖「渲染 + 零异常 + 无溢出」，**不能替代本节**。

---

## 7. 已知 MVP 简化项（按需升级，代码/PRD 已标注）
- 计算引擎在前端；节假日/调休用静态表 `holidays2026.js`（生产应迁 `holiday_calendar` 表，**RK-06**）。
- 个税按月简化（非累计预扣法）。
- 期初余额手填（生产应自动取上月结余）；「转正假设薪资」本地 ref 刷新重置。
- Dashboard 只取 `salary_config` 的 `regular` 阶段，未区分 probation 实际阶段。
- AI 购物劝导上下文为占位（无真实历史消费）。
- `repayment_event` 无 UI 写入口（store action 已备，Settings 未接表单）。
- `Settings.vue` 的 `sb_base_unemploy` 表单复用了 `sb_base_medical` 值（SQL 保留独立字段，UI 未单列输入）。

## 8. 关键约束 / 红线（务必延续）
- **paytrace1 已废弃**：桌面 `C:\Users\2041622796\Desktop\paytrace1\` 是更早的平行项目，用户明确"不要看、已废弃"。其数据口径/视觉/AI 架构与本项目冲突，**禁止参考**。
- **agnes key 绝不落地前端**：只能经 `agnes-proxy` Edge Function 服务端调用；前端 `.env` 只放 anon key。
- **多租户强制 RLS**：9 张用户自有表 `using (auth.uid()=user_id)`；`insurance_rule` / `holiday_calendar` 为全局表，认证用户可读、写由 service_role。
- **用户名登录方案不要推翻**：底层就是 Supabase Auth + email 别名，别去改造成原生 username（成本极高且会动 RLS）。
- **合规红线**：AI 购物劝导/简报必须带 disclaimer（"不构成建议/不承诺收益"）；不设计诱导消费/借贷/虚假营销；不承诺投资/医疗效果；个人信息脱敏。

## 9. 验收基准（来自 PRD / product_baseline.json）
- 武汉江汉区个人比例：养老 8%、医疗 2%、失业 0.3%、公积金 8%、大额医疗固定 7 元。
- 社保基数：养老 4552、医疗/失业 4498、公积金 2400（paytrace1 旧口径 4498/662.29 已弃用）。
- 日历：双休；发薪日遇休**提前**、还款日遇休**顺延**（profiles 可配 advance/postpone/keep）。
- 预警：余额 ≤0 红、<200 橙、距还款 ≤7 天且余额不足 黄。
- 表数量：`0001_init.sql` 共 **11 张表**（旧文档误写 12）。

## 10. 一句话给下一个对话的 Agent
"前端代码已全部就绪并验证（含 Pinia、用户名登录、3 个 bug 修复），唯一卡点是用户 Supabase 侧 4 件事：跑 0001_init.sql 迁移（旧库用 §6 补丁补 username 列，别整份重跑）、关 Confirm email、部署 agnes-proxy + 设 AGNES_API_KEY、注入测试数据。逐项确认后 npm run dev 验全链路，重点看 Settings 保存后 Dashboard 自动刷新。paytrace1 废弃不看，agnes key 不落前端，RLS 与合规 disclaimer 红线不能动。"

---

## 11. 2026-11-04 第三轮变更（**覆盖 §4~§9 中的过时结论**）

> 用户提出 8 项改进，全部在前端落地，**未改数据库 schema / RLS / 迁移**。

### 11.1 配置档案化 + 版本化
- 「参数配置」改名「档案配置」，默认只读总览，点「变更档案」才进入编辑态（低频数据不该是可随手改的表单）。
- 薪资变更改为**追加 `salary_config` 新行**，不再 `update` 覆盖；按 `created_at DESC LIMIT 1` 取当前生效版本，新增「档案变更记录」列表，历史可回溯。零 DDL。
- 新增 `src/lib/constants.js`：入职日期 `2026-07-13`、固定双休、发薪日 15、个税起征点 5000、武汉社保基数。`product_baseline.json` 里本来就有这些数据，此前代码没用起来。
- 移除「发薪日遇休」「还款日遇休」「工作制」三个配置项（工作制固定双休，不会变）。

### 11.2 发薪 / 还款口径纠正
- **工资按每月固定日当天到账，遇周末 / 法定节假日照发**。实证：`2026-11-15` 是周日，而 `product_baseline.json` 明确写该日发放转正首月工资。
- **还款按账单日当天扣款，不顺延**（是否顺延由平台决定，不该由用户配置；且挪用日期会扭曲预测曲线）。
- `useCashflow.js` 不再调用 `adjustDate`；函数保留但标注停用。`pay_adjust_rule` / `repay_adjust_rule` 数据库列保留（避免 DDL），引擎与 UI 均已忽略。

### 11.3 风险提示重写
- 原来每天 push 一条「现金缺口」→ 改为按事件聚合、最多 6 条：现金转负 / 安全垫偏薄 / XX 可能不够扣 / 发薪前低谷 / 单日支出集中 / 月末仍为负 / 本月现金流安全。
- 每条含 `level / title / detail / advice`，带具体金额、日期与可行动建议；已转负时不再重复报「发薪前低谷」。

### 11.4 缓存机制
- 新增 `src/lib/cache.js`：localStorage 按 user_id + 版本号隔离，TTL 12 小时，读写全程异常兜底。
- `app store` 三级读取：内存 → 本地缓存 → Supabase；并发 `load()` 去重；账号切换自动 `$reset`；所有写操作同步刷新缓存；`auth.logout()` 清缓存。
- 流水 / 待办等高频数据不缓存。

### 11.5 中文化与移动端
- 新增 `src/lib/labels.js` 统一枚举→中文映射与金额/日期格式化；界面文案去英文（`regular` / `MVP` / `RLS` / `agnes-3.0-flash` / `AI` / `Edge Function` 等）。
- **边界**：数据库字段、API 契约、代码标识符保持英文（改了会牵连 RLS 与已有数据），只中文化用户可见层。
- 新增 `src/composables/useMediaQuery.js`；`AppLayout` 在 ≤768px 切换为顶部栏 + 底部中文导航、桌面侧边栏隐藏；卡片 / 表格 / 表单 / 图表全部响应式，ECharts 加 `ResizeObserver`。
- CDP 375px 真实视口验证：`overflowX: false`、底部导航与顶栏渲染、侧边栏 `display:none` ✅。

### 11.6 顺带修掉的历史缺陷
- `app.js` 的 `addRepayment` 传了 `repayment_event` 不存在的 `name` 列 → 已去掉。
- `Settings` 补上 `repayment_event` 的增删 UI（原 §7「无 UI 写入口」已解决）。
- **§6 D 的测试 SQL 有 CTE 作用域 bug**：`with u as (...)` 只作用于第一条 INSERT，后两条报 `42P01: relation "u" does not exist`。勿再照抄原版，改用本轮对话给出的幂等版（直接用 userid，每条 INSERT 自带 `where not exists`）。
- 登录卡片固定 `width:360px` 在窄屏溢出 → 改 `width:100%; max-width:360px`。
- 空薪资档案时 `calcNetSalary` 返回 `-7`（固定大额医疗 7 元）→ 已兜底为 0，Dashboard 加空档案提示。

### 11.7 验证结果
`npm run build` ✅；引擎纯函数冒烟：发薪日 15（周日不变）、风险 4~5 类且各不相同、空档案到手 0；dev server 200；无头浏览器 DOM + 375px 设备模拟截图均通过。

### 11.8 可选 SQL（把入职日期写回库）
```sql
update public.profiles set hire_date = '2026-07-13'
where user_id = '<你的 user_id>'::uuid;
```
前端常量已兜底，不执行也能正常显示。

---

## 12. 2026-11-04 第四轮增强（全部纯前端、零 DDL、零新增依赖）

### 12.1 多月滚动前瞻 ⭐
- 新增 `computeMultiMonth()`：以上月结余作为下月期初，逐月复用日度引擎，默认 6 个月（可切 3 个月）。
- Dashboard 新增「未来 N 个月前瞻」卡片：每月月末结余 / 月内最低 / 当月到手 / 首要风险 / 转负日。
- 「每月固定还款」输入（分期月供等重复扣款）持久化到 localStorage。
- 仅统计已录入的还款，未录入月份按固定开支 + 每月固定还款推演，界面已注明假设。

### 12.2 流水账本（新页面 `/ledger`）⭐
- 补齐闭环：`transaction` 表此前只有 AI 写入、没有任何查看入口。
- 本月收入 / 支出 / 净额、支出分类占比（纯 CSS 横条，不额外引图表）、手动记一笔、删除、最近 200 条列表。
- 导出 CSV：UTF-8 BOM，双引号转义 + Excel 公式注入防护。
- 路由与桌面 / 移动菜单同步，底部导航由 4 项变 5 项。

### 12.3 个税改累计预扣法
- `calcNetSalary(config, { monthIndex })`；新增 `serviceMonthIndex()` 按入职月算任职月份数，跨自然年重置。
- 年度预扣率表 7 档（3%~45% + 速算扣除数）；本月税 = 累计税 − 上月累计税。
- 实证：税前 20000、11 月（第 5 个任职月）个税 1433.33，旧的按月简化约 430；用户实际 6000 档位处于 3% 线性区，结果与旧算法一致（5323.39），无跳变。

### 12.4 待办临期自动置顶
- 按「逾期 > 3 天内 > 7 天内 > 无日期 > 远期 > 已完成」排序，新增紧急度列与顶部汇总提示（补上 PRD 的 Todo 联动要求）。

### 12.5 构建体积优化 ⭐
- `CashflowTimeline.vue` 改 ECharts 按需引入（`echarts/core` + LineChart / Grid / Tooltip / Legend / MarkLine / MarkPoint / CanvasRenderer），渐变改声明式对象，不再依赖 `echarts.graphic`。
- `vite.config.js` 加 `manualChunks`：charts / ui / supabase / vendor 四类。
- 效果：业务入口 `index` 从 1760 kB 降到 **8 kB**；ECharts 相关从约 1 MB 降到 charts 503 kB；业务代码改动不再让三方库缓存失效。
- 已知限制：`ui` chunk 仍 1359 kB（Naive UI 全量注册换开发便利），后续可改按需引入再砍一刀。

### 12.6 缓存可观测
- `app.refresh()` 暴露强制刷新；Dashboard 显示「档案更新于 X（本地缓存 12 小时）」+ 强制刷新按钮。

### 12.7 验证
- `npm run build` ✅ 7.66s
- 引擎纯函数：任职月数 5、累计预扣税 1433.33、6 个月结余正确滚动且跨年重置
- CDP 375px 真机视口：ledger / dashboard / todo 三页零运行时错误、`canvas` 正常渲染、底部导航 5 项、`overflowX:false`

---

## 13. 2026-11-04 第五轮：数据正确性专项 + 缺口补齐

### 13.1 修掉 6 个会算错 / 存错数据的问题
1. **时区导致日期错一天（最严重）**：4 处 `new Date(ts).toISOString().slice(0,10)` 在 GMT+8 把用户选的 11 月 15 日存成 `2026-11-14`，影响入职日期、还款日、待办关联日、流水日期。Node 实证已复现。新建 `src/lib/date.js` 统一本地时区格式化并全部替换。
2. **AI 记账写入零校验**：模型返回「昨天」/ 中文方向 / 非数字金额会直接写库。`AINote.vue` 解析后即校验，不合规禁用写入按钮。
3. **个税起征点配了不生效**：引擎硬编码 5000，Settings 的 `tax_threshold` 存了没用。现改为 `calcNetSalary(config, { taxThreshold })` 全链路传入。
4. **月度汇总漏数**：Ledger 用 `limit(200)` 的列表算本月收支，超过 200 条会漏。改为当月全量独立查询。
5. **浮点漂移**：金额累加统一 `round2()`。
6. **薪资版本排序不稳**：`created_at DESC` 同一秒插入可能取错版本，加 `id` 二级排序。
- 另：`sb_base_unemploy` 之前 UI 复用 medical 值，现独立输入；「标记到账」两步写改为失败时补偿回滚，避免半截数据。

### 13.2 统一校验层
`src/lib/validation.js`：`validateTransaction / Profile / Salary / Repayment / Expense / PendingIncome` + `round2`。原则是**宁可明确拒绝，也不静默截断或自动纠错**（截断等于悄悄改掉用户数据）。UI 层与 store 层双重校验，store 是最后防线。

### 13.3 新功能
- **待收收入**（合并进流水账本页）：baseline 里的奖金 2000、应届生社保补贴等未到账的钱终于有入口；「标记到账」写入收入流水 + 更新状态，第二步失败自动撤销流水。
- **数据体检页 `/check`**：只读扫描档案完整性、薪资合法性、重复开支、过期还款、非法流水日期 / 方向 / 金额、待收金额、个税调薪假设提示。
- 底部导航 5 → 6 项。

### 13.4 回归测试 ⭐
`frontend/verify.mjs` + `npm run verify`：用 esbuild 打包源码后以 data URL 导入，无需临时文件。**29 项断言**覆盖社保口径、累计预扣（含真实历史月份精确模式）、发薪 / 还款不顺延、浮点、多月滚动、本地时区日期、各类非法输入。**改引擎前先跑它。**

### 13.5 已知假设（诚实标注）
- 未传 `ytdMonths` 时，累计预扣法假设年内每月薪资相同；年内调过薪会与工资条有差异。引擎已支持传入真实历史月份精确重算，UI 尚未提供录入入口（数据体检页会主动提示）。
- 多月预测只统计已录入还款；未录入月份按固定开支 + 每月固定还款推演。
- `ui` chunk 仍 1359 kB（Naive UI 全量注册）。

### 13.6 验证
`npm run verify` 29/29 ✅；`npm run build` ✅ 7.70s；CDP 375px 浏览器冒烟。

---

## 14. 2026-11-04 第六轮：对账闭环 / 个税精确校准 / 负债 / 目标安全垫

### 14.1 统一推演入口 ⭐
新增 `src/composables/useProjection.js`：`buildProjection()` 集中定义全部推演口径（起征点、任职月数、历史薪资校准、还款筛选、开支映射）。Dashboard 与 Ledger 月度对账共用，杜绝「两个页面各自组装参数 → 同一个月出现两个预测值」。`getYtdMonths()` 读本机年内历史薪资交给累计预扣法。

### 14.2 月度对账（并入流水账本页）
- 预测月末（统一推演）vs 实际月末（期初 + 当月流水净额）vs 偏差，附偏差归因文案。
- 列出「预测有支出、流水里没有对应记录」的事件（不含发薪，避免噪声），提示可能漏记。
- 期初余额走本地偏好；明确注明口径与「当月未过完时偏差属正常」。

### 14.3 年内历史薪资录入（档案配置折叠区）
- 按入职月到上月自动生成月份行，填税前月薪 + 五险一金合计。
- `validateSalaryYtd` 校验月份唯一 / 范围 / 金额；保存后 `writePref` 派发 `paytrace:pref-changed`，仪表盘与账本**不刷新**即刻重算（跨标签页靠 storage 事件）。
- 至此 §13.5 里「唯一已知金额误差来源」在录入真实工资条数据后关闭。数据体检页显示「已校准 N 个月」。

### 14.4 负债清单（档案配置折叠区）
- `liability` 表 CRUD：类型 / 总额 / 已还 / 剩余本金 / 手续费 / 下次还款日 / 状态，中文枚举映射 + 总剩余本金汇总。
- `validateLiability` 校验已还 ≤ 总额、剩余本金 ≤ 总额、日期与枚举。
- 明确**不自动改写还款日历**，避免重复扣款。

### 14.5 目标安全垫（仪表盘）
目标金额（本机偏好，默认 2000）→ 达成度进度条、差额、从多月前瞻推算预计达成月份。

### 14.6 偏好统一
新增 `src/lib/prefs.js`：`readPref / writePref / migrateLegacy`，兼容旧 key 不丢用户已填值；`writePref` 派发同页事件。`app store` 增 `liabilities` 与 `totalRemaining`，缓存一并覆盖。

### 14.7 验证
`npm run verify` **35/35** ✅（新增统一推演一致性、当月还款筛选、负债校验、历史薪资校验 6 项）；`npm run build` ✅ 7.83s；CDP 375px 四页零运行时错误、6 导航、`overflowX:false`、图表 canvas 正常。

### 14.8 未做（明确取舍）
- **Naive UI 按需引入**：需改 10+ 文件、20+ 组件，漏注册是「静默不渲染」而非报错，与「不要出错」冲突，留独立一轮配逐页回归专做。`ui` chunk 仍 1359 kB。
- **节假日迁 `holiday_calendar` 表**：需要 DDL 与用户在 Supabase 侧执行；且日历属性只用于展示、不影响资金流（不做顺延），不影响金额准确性。
- **浏览器通知**：用户明确不需要。

---

## 15. 2026-11-04 第七轮：Naive UI 按需引入 + 正确性收口

### 15.1 Naive UI 按需引入 ⭐
- `main.js` 去掉 `app.use(naive)` 全量注册，改为 21 个组件具名导入 + `app.component()` 注册。
- **双重兜底**（这是上轮担心的「漏注册静默失效」的正确解法）：
  1. `npm run verify` 静态扫描：遍历所有 `.vue` 模板的 `<n-xxx>`，转 PascalCase 与 main.js 的 `components` 清单比对，漏一个即失败；另检查「扫描数 < 15」防止正则失效假通过。
  2. `main.js` 的 `app.config.warnHandler` 捕获 `Failed to resolve component` 写入 `window.__missingComponents`；CDP 冒烟逐页断言为空并 hook `console.warn`。
- 效果：`ui` chunk **1359 kB → 751 kB**（gzip 361 → 198 kB），降 45%；警告阈值调至 800（剩余是 21 个组件的合理体积，已独立长期缓存），构建现已无 chunk 警告。

### 15.2 数据不静默降级
- `app.load()` 的 5 个并行查询任一失败即抛出「档案加载失败」，不再把 `data=null` 静默当成「无档案」显示全 0。
- `app.config.errorHandler` / `warnHandler` 收集异常到 `window.__appErrors` / `__missingComponents`，供自动化检查。

### 15.3 写操作防重复提交
- 新增 `src/composables/useBusy.js`：页面级互斥锁，所有写操作共用 `run()`，进行中拒绝新请求。
- Settings / Ledger 的新增、删除、保存、到账动作全部接入，按钮同步禁用。

### 15.4 修掉一个一直存在的中文化遗漏
- `AINote.vue` 的 `n-tab-pane` 用了组件库不认的 `title` prop（被当成原生 HTML 属性），Tab 头一直显示英文 `note` / `advise`。改为 `tab` 后正确显示「大白话记账 / 购物劝导」。
- `verify.mjs` 新增检查：任何 `<n-tab-pane>` 用 `title` 而无 `tab` 即失败。

### 15.5 新功能
- **全量备份导出**（数据体检页）：只读 JSON 快照，含档案 / 薪资版本 / 开支 / 还款 / 负债 / 流水 / 待办 / 待收 / 本机偏好；刻意不提供导入，避免误覆盖现有数据。
- **流水月份切换 + 搜索**（账本页）：按所选月份查全量（汇总与列表同一份数据，不再 `limit 200`），关键词匹配分类 / 备注 / 金额；对账与 CSV 导出都跟随所选月份与搜索结果。

### 15.6 验证
`npm run verify` **37/37** ✅；`npm run build` ✅ 6.98s 无警告；CDP 375px **6 个页面**全部通过：零漏注册、零运行时异常、零组件解析警告、零横向溢出、6 导航、图表 canvas 正常。

### 15.7 剩余已知限制
- `ui` 751 kB / `charts` 503 kB 是第三方库，已拆为独立长期缓存 chunk；再降需换组件库或自绘组件，收益有限。
- 节假日静态表 2027 数据不全（RK-06），但日历属性只用于展示，不影响资金流金额。
- 多月预测只统计已录入还款；本机偏好不跨设备同步。

---

## 16. 2026-11-04 第八轮：真实数据种子 + 密钥清理 + 文档一致性收口

### 16.1 新增 `supabase/0002_real_data_seed.sql`（**未执行**）
8 段、幂等、零 DDL、不动 RLS，严格限定单个 user_id。静态校验已跑：全部 6 条 INSERT 的列名与 `0001_init.sql` 的 11 张表定义一致。SQL 由用户在 Supabase SQL Editor 执行，本对话不代执行。
执行前备份（数据体检页「导出全量备份」），第 0 段为破坏性清理可单独跳过；执行后看第 8 段计数（期望 1 / 4 / 3 / 2 / 3 / 4）。
另需前端填 4 项本机偏好：年内历史薪资、期初余额 465、每月固定还款 241、核对社保基数。

### 16.2 明文密钥清除（**轮换仍未完成**）
明文 `AGNES_API_KEY` 曾出现在两处：本文件 §6 C、`supabase/functions/agnes-proxy/README.md`。两处均已删除，措辞改为「从 agnes 控制台获取，仓库不得写明文」，并注明历史值视为已泄露。全项目 Grep 确认无 `sk-` 残留。
**需在 agnes 控制台轮换密钥，并同步更新 Supabase Secret —— 只能用户操作，本对话做不了。**

### 16.3 本轮文档修订（防止下一位踩坑）
- §0 状态速览从第一轮的旧结论（「Supabase 4 件均未确认」）更新为当前真实状态，并明确「所有浏览器验证均为模拟会话，未覆盖真实登录→读库→写库」。
- §6 B 的增量补丁替换为完整幂等版（补 `work_schedule`、profiles 行缺失兜底、触发器 `coalesce` 兜底 + `drop trigger`、回填后再建唯一索引），避免 `23505` 与「设了 not null 后新用户注册失败」。
- §6 D 的 CTE 测试 SQL 已废弃并写明 `42P01` 根因，改为指向 `0002_real_data_seed.sql`；§6 E 验收清单扩为 6 项真实账号操作。

### 16.4 剩余待办（按优先级，下一位从这里接）

**P0 — 剩余项（用户已确认完成 1 / 2 / 5）**
1. ✅ `profiles.username` 增量补丁 — 用户已确认执行成功（2026-11-04）。
2. ✅ `0002_real_data_seed.sql` — 用户已确认执行成功，真实数据已落库。
3. **真实账号全链路验收（§6 E 六项）—— 本对话从未做过，是唯一未闭环的工程验证**。所有 CDP 浏览器验证都是模拟会话，只证明渲染与零异常。
4. **在 agnes 控制台轮换密钥 + 更新 Supabase Secret**；确认 `Confirm email` 已关、`AGNES_API_KEY` 已设。
5. ✅ 本机参数一键预填（见 §17）；`hire_date` 已由种子 SQL 第 1 段写入，无需再单独执行 SQL。仍需对照工资条核对历史薪资与 4 个社保基数。
6. **可选**：`supabase functions deploy agnes-proxy` 重新部署，启用「一句话多笔」解析（见 §18）。不部署也能正常使用，前端兼容旧版单对象返回，只是每次只解析出一笔。

**P1 — 值得做，不阻塞正确性**
- 历史口径时间轴：7–10 月社保旧基数 4498 + 每月补差 54；「试用期 / 转正」未按入职日自动推导。
- 社保比例硬编码在 `useCashflow.js` 的 `RATE`（武汉口径），`insurance_rule` 表建了没读 → 换城市不准。
- 对账容差：目前「同日 + 金额完全相等」匹配，差几分钱会误报未匹配。
- 期初余额 / 每月固定还款持久化到本机偏好（现在刷新重置）。
- `ai_interaction_log` 有表无前端查看 / 纠错 / 准确率入口；待办未从还款事件自动生成。
- 节假日静态表迁 `holiday_calendar`（需 DDL + 用户侧维护）。

**P2 — 工程质量**
- 组件 / Pinia store 自动化测试（现有 37 项都是纯函数，缓存失效逻辑未覆盖）。
- ESLint / Prettier + CI 自动跑 `verify` + `build`。
- 加载骨架屏、常驻错误条（现在 `load()` 抛错只弹 toast，页面仍显示空数据）。
- 部署静态托管（hash 路由已兼容，无需 rewrite）。

**明确不做**：浏览器通知（用户明确不需要）、Naive UI 再瘦身（已降 45%）、多币种 / 多账户 / 投资建议（超 MVP 定位且碰合规红线）。

### 16.5 一句话给下一位
「代码侧已闭环，Supabase 侧的迁移补丁与真实数据种子都已由用户执行完成。剩下两件用户侧动作：真实账号跑 §6 E 全链路、轮换 agnes 密钥。别再用模拟会话的浏览器结果当作全链路已验证。」

---

## 17. 2026-11-04 第九轮：真实数据落地后的正确性收口

用户确认 P0 #1（`username` 补丁）与 #2（种子 SQL）均已执行成功后，本轮聚焦「让真实数据被正确、省事地用起来」。全部纯前端、零 DDL、零新增依赖。

### 17.1 修掉一个会算错钱的 bug（最高优先级）
`computeMultiMonth()` 原先对**每一个月**（含当月）都追加「每月固定还款」。而真实数据的 11 月还款日历里已有 `2026-11-15 / 241` —— 用户按上一轮建议填 241 后，当月会被**重复扣 241 元**，且多月前瞻首行的月末结余与仪表盘顶部指标卡不一致（违反 §14 建立的「统一推演口径」）。
修法：该月已录入同额月供时跳过追加；未录入的未来月份仍补齐。新增 3 条回归断言锁死（当月不变、首月与单月推演完全相等、未来月份仍扣 241）。

### 17.2 期初余额统一（消除两个预测基准）
Dashboard 的 `startBalance` 原先是 `ref(0)`，**刷新即丢**；Ledger 的 `reconcileStart` 单独存 `paytrace:pref:reconcileStart`。同一个「期初余额」两处各存一份会导致对账基准与仪表盘基准不一致。
统一为 `paytrace:pref:startBalance`：`prefs.js` 新增 `readStartBalance()` / `writeStartBalance()`（兼容旧 key 自动迁移），两页共用并双向同步（自定义事件 + storage）。CDP 实测：在数据体检页写入 465 后，切到仪表盘输入框立即显示 465。

### 17.3 对账容差
新建 `src/lib/reconcile.js`：金额在容差内即视为同一笔，容差同时用于「事件是否入账」与「整体偏差是否吻合」，不再有两套口径。账本页新增「匹配容差（元）」输入，默认 1 元、可配 0~1000，持久化。原先严格相等会把 `240.60` 与 `241.00` 误报成「未匹配」。

### 17.4 基准参数一键预填 + 落库结果核对
新建 `src/lib/baseline.js`，数据体检页新增两个能力：
- **按基准数据预填**：严格「预览 → 确认」两步，只写本机 localStorage，不改数据库；**任何已填值一律跳过，绝不静默覆盖**。预填历史薪资按 baseline 月度现金流表的真实口径：7 月不发薪留空，8 月 716.29、9/10 月 720.61（含每月 54 元社保补差），税前均 4000。
  > 口径说明：baseline 自身对 8 月扣款有 716.29 / 720.61 两种表述，此处按月度表「到手」反推；且当前收入档位累计应纳税所得额为负、个税恒为 0，预填不改变当前金额，只是把口径留全以备调薪。仍须对照工资条核对。
- **基准数据核对**（只读）：比对税前 5000、月固定开支 1179、11.15 分期 241、11.25 白条 3619.44、负债 3 笔、待收 3 项；不同给「留意」而非「严重」（用户可能有意调整）。11 月账单仅在基准当月校验，跨月不误报。另提示 11.1 话费充值 100 需补记流水。
- 备份导出的本机偏好同步更新为统一后的 key。

### 17.5 验证
`npm run verify` **49/49** ✅（新增 12 项：重复扣款 3、容差 3、预填 3、基准核对 2、种子 SQL 枚举映射 1）；`npm run build` ✅ 6.96s 无警告；CDP 375px **6 个页面**零运行时异常 / 零组件漏注册 / 零横向溢出 / 图表 canvas 正常；预填两步交互与跨页期初余额联动均实测通过。
> 期间一次失败是测试断言把 `repayments` 写成了引擎的 `date` 而非库里的 `due_date`，属测试数据格式问题，已修正，实现未改。

### 17.6 仍未闭环
真实账号全链路验收（§6 E）、agnes 密钥轮换 —— 都需用户在自己的账号/控制台操作。P1 待办（历史口径时间轴、社保比例读表、AI 日志入口、待办自动生成）本轮未动。

---

## 18. 2026-11-04 第十轮：大白话记账改为「可编辑草稿清单」

### 18.1 前端（零新增依赖、零新增组件）
`AINote.vue` 从「单条只读卡片 + 一个写入按钮」改为完整草稿清单：
- **逐条可编辑**：日期（原生 date，天然 `YYYY-MM-DD`，避开时区坑）、方向、分类、金额、备注；每条实时校验，错误直接显示在卡片上，不合规禁用该条写入。
- **逐条可控**：勾选框、删除、「写入这一笔」；顶部「添加一笔」「全选」「清空清单」（两步确认，4 秒自动解除）。
- **批量写入**：只写「已勾选 + 校验通过」的条目，一次 `insert(数组)`，失败整批不落库；`useBusy` 互斥锁防连点。写入成功后仅移除已写入条目，其余草稿保留。
- **AI 结果追加而非替换**：重新解析不会覆盖用户已编辑的草稿。
- 保留合规 disclaimer 与购物劝导 Tab；`n-tab-pane` 仍用 `tab` 而非 `title`。
- 新增纯函数层 `src/lib/aiDraft.js`：规范化 AI 返回、逐条校验、拆分可写/非法条目，供回归测试。

### 18.2 服务端（**需用户重新部署才生效**）
`supabase/functions/agnes-proxy/index.ts`：`parse_note` 的 prompt 改为输出 `{"items":[...],"confidence":...}`，要求一句话含多笔时逐笔列出、不得合并或遗漏；服务端把结果统一规整成数组，并兼容模型偶发返回旧单对象；`draft` 取各笔最低置信度。购物劝导返回结构不变。
**前端 `normalizeAiResult` 同时兼容数组 / `{items:[]}` / 单对象 / 空结果**，所以不重新部署也完全可用，只是每次解析一笔。README 已同步契约说明。

### 18.3 验证
`npm run verify` **59/59** ✅（新增 10 项 AI 草稿断言：多笔不合并、中文方向映射、四种返回形态、逐条校验、勾选拆分、单笔强制、手动新增默认值、低置信识别）；`npm run build` ✅ 7.09s 无警告。
CDP 375px 用 fetch 拦截模拟「午饭45，打车23」：解析出 **2 张草稿卡**、低置信标黄、金额 45/23、写入按钮启用；实测编辑分类生效、删除、取消勾选后「可写 0 笔」、手动新增空白条目被校验拦下、全选后「可写 1 笔」、清空两步确认 —— 全程零运行时异常、零组件漏注册、无横向溢出。

### 18.4 注意
- 写入按钮会真实请求 Supabase，模拟会话下未点击；**真实写入链路仍需 §6 E 第 5 项验收**。
- 服务端改动未部署（本对话无 Supabase 权限）。部署命令：`supabase functions deploy agnes-proxy`。

---

## 19. 2026-11-05 第十一轮：日历数据严格性 + 缺口补齐

> 本节只追加，未修改 §0~§18 的任何内容。本轮主 Agent 做「日历数据严格性」修复，并行补齐工程配置 / 文档 / 合规展示层。

### 19.1 四类日历数据差错修复
1. **星期表头错位**：日历按 `weekOrder` 下标取星期，导致 2026-11-01（周日）落在错误列。改为固定表头 `['一','二','三','四','五','六','日']` + `(getDay()+6)%7` 对齐，`weekOrder` 标识符彻底移除（回归断言校验 11-01 落在「日」列）。
2. **跨月期初余额不滚动**：现金流日历此前每月都用同一个期初，跨月前后接不上。改为上月结余作为下月期初，`buildMonthProjection()` 逐月滚动。
3. **漏传每月固定还款**：日历页未把 `readRecurringRepayment()` 的固定月供交给推演，未来月份少扣。补传，并与已录入的当月账单去重、不重复扣 241。
4. **整月开支压在 1 号**：月固定开支原先整月金额一次性计在扣费日（1 号），11/1 余额被压成 -714。改为按日均摊。

### 19.2 按日均摊与全月守恒
- 每天发生的月固定开支按当月天数均摊，28 / 29 / 30 / 31 天月份全月合计精确守恒（回归断言逐个校验合计 = 1048），一分不丢。
- 按日均摊的日常零花不进入逐笔对账清单，避免噪声；本机偏好可在「按日均摊 / 计入扣费日当天」间切换。

### 19.3 跨页一致性验证
- 统一推演入口 `useProjection.js`：`buildProjection()`（仪表盘 / 多月前瞻）与 `buildMonthProjection()`（日历跨月滚动）共用同一份参数组装。
- 回归断言锁死：日历 11 月月末 = 仪表盘当月月末 = 多月前瞻首月月末；12 月期初 = 11 月月末；12 月月末 = 多月前瞻次月月末。日历与仪表盘不再差 241 / 947 元。

### 19.4 社保规则读表
- 社保比例由 `insurance_rule` 表读取（`src/lib/insurance.js`），并新增**公司缴纳**计算；不再前端硬编码武汉比例，换城市更准。个人扣款 / 到手工资口径不变。

### 19.5 风险扫描与回归断言
- 风险扫描在原有事件聚合之外，新增「还款冲突」「长期分期负担」两类。
- `frontend/verify.mjs` 回归断言由 **63 项增至 83 项**，新增「日历数据严格性」9 项（表头对齐、节假日逐条等于国务院通知、按日均摊守恒、跨月一致性、跨页入口）与「社保规则与金额严格性」9 项（读表后 666.61 / 4333.39 / 公司成本 1338.64 逐条等于基准、改规则金额随之变、空表回落不漂移、档案页与仪表盘同口径、两类新风险、默认不打码），另加「RLS 静态校验」与「还款到期提醒」2 项。
- 2026 节假日静态表已对照国务院办公厅《关于 2026 年部分节假日安排的通知》逐条核验；2027 数据待补全（RK-06）。

### 19.6 本轮工程配置 / 文档 / 合规展示层
- 顶层 `README.md`（原 0 字节）补成完整项目说明；`frontend/README.md` 更新到 8 页面 / 别名登录 / 累计预扣 / 83 项断言 / 按需引入等真实现状。
- 新增 `.gitignore`、`.github/workflows/ci.yml`（Node 20：npm ci → verify → lint → build）、零依赖 `frontend/lint.mjs`（package.json 加 `lint` 脚本，未动 package-lock）。
- 新增 `src/lib/privacy.js` 金额打码偏好；`labels.js` 的 `formatMoney` 脱敏开启返回 `••••`，默认关闭、Node 下自动回退，不影响断言。
- `AppLayout.vue` 加「金额打码」开关（派发 `paytrace:pref-changed`）、「导出全部数据」跳转数据体检页、「注销账户」仅诚实说明入口（不假装删除）。
- `DataCheck.vue` 新增「AI 交互日志」区块（读 `ai_interaction_log`、写 `accepted`）、纳入全量备份、`app.load()` 失败顶部常驻错误条 + 重试。
- `main.js` / `App.vue` 加首屏 auth 骨架屏与全局错误收集展示入口，保留 `errorHandler` / `warnHandler` 写 `window.__appErrors` / `__missingComponents` 的逻辑。
- 本 PRD 追加第十六章「实现口径与 PRD 的偏差」。

### 19.7 仍需用户侧操作（本轮不闭环）
1. **真实账号六项全链路验收（§6 E）**：所有浏览器验证均为模拟会话，只证明渲染与零异常，不能替代真实登录 → 读库 → 写库。
2. **agnes 密钥轮换 + 更新 Supabase Secret `AGNES_API_KEY`**：历史明文视为已泄露，需用户在 agnes 控制台操作。
3. **重新部署 `agnes-proxy`**（`supabase functions deploy agnes-proxy`），启用「一句话多笔」解析；不部署也能用，只是每次解析一笔。
4. **上线部署**（前端静态托管，hash 路由无需 rewrite），确认 `Confirm email` 已关、`AGNES_API_KEY` 已设。
5. **对照工资条核对 4 个社保基数**（养老 4552、医疗 / 失业 4498、公积金 2400）与**年内历史薪资**（各月税前与五险一金），必要时在「档案配置 → 年内历史薪资」更新。

### 19.8 主 Agent 统一复核与收口（2026-11-05 晚）
- 复核发现并修掉「档案配置页到手预览仍用兜底比例」：`Settings.vue` 的 `netNow / netPreview / historyNet` 全部注入 `effectiveRates`，与仪表盘 `buildProjection` 用同一套规则；`rulesSource` 改按 `matched > 0` 判断，避免「表里有行但城市不匹配」时文案误报「来自规则表」。这是本轮最容易再次造成「两页算出两个数」的隐患。
- `supabase/functions/agnes-proxy/index.ts` 的购物劝导系统提示词补齐前端实际传入的英文字段说明（`currentBalance` / `monthMinBalance` / `monthEndBalance` / `negativeFromDay` / `monthlyNetSalary` / `upcomingRepayments` / `topRisks` / `safetyLine`），避免模型猜错字段；**需重新部署才生效**（见 §19.7 #3）。
- 统一复核结果：`npm run lint` 通过（扫描 33 个文件 / 99 条相对 import / 0 阻断）、`npm run verify` **83/83**、`npm run build` 通过。
- 初始化 git 仓库并完成首次提交；`.env` / `node_modules` / `dist` 均由 `.gitignore` 排除，未入库。临时校验产物 `dist-check-*` 与一次性审计脚本已清理。
- 补上 PRD FR-06 的「到期前 3 天 / 1 天站内提醒」：`Dashboard.vue` 新增还款提醒条，按 GMT+8 自然日差区分「今天 / 还有 N 天 / 已逾期 N 天」，排除已标记已还，逾期升级为红色告警；配套静态断言锁死。
- `verify.mjs` 新增 RLS 静态校验：逐表断言 9 张用户表启用 RLS 且策略限定 `auth.uid()=user_id`，两张全局表只读（RK-05 的静态部分；动态越权测试仍需真实账号）。
- 诚实标注未完成项：「账户注销并删除数据」仍只有说明入口（真正删除需 service_role / Edge Function）；`holiday_calendar` 表未接线、2027 节假日数据待补全；RLS 跨用户越权测试需真实账号，归入 §19.7 #1。

---

## 20. 2026-11-05 第十二轮：动效系统（零新增依赖）

- **技术选型**：纯 CSS `transform` / `opacity` + Vue `<transition>`，不引入 Framer Motion / GSAP / Lottie（Vue 项目且要保持零依赖）。全局 token 写在 `src/styles/theme.css`：`--dur-fast/base/slow`、`--ease-out/in-out`。
- **页面层**：`App.vue` 用 `<transition name="auth-page" mode="out-in">` 处理登录 ↔ 主界面，**刻意不加 `:key`**，避免子路由切换重建 AppLayout；主界面内子页面切换由全局 `main.content > *` 的 `page-in` 入场覆盖（兼容 Dashboard 的多根节点模板）。
- **卡片 / 日历**：`.card` 统一 `rise-in`；`Calendar.vue` 给格子与当日明细加 `--i`，按 10ms / 45ms 交错浮现；`Login.vue` 登录卡片 `pop-in`、品牌点短脉冲（仅 3 次）。
- **图表**：`CashflowTimeline.vue` 顶层配置 `animationDuration: 520` / `animationEasing: 'cubicOut'` / `animationDurationUpdate: 320`，每条线 `animationDelay: idx * 8` 从左到右绘出；只影响绘制过程，数值与数据点不变。
- **骨架屏**：shimmer 从动画 `background-position`（持续重绘）改为伪元素 `transform: translateX()`，符合只动画 GPU 属性的约束。
- **交互**：侧边栏激活指示条用 `::before` + `scaleY`（不动画宽度 / 位置）、移动端导航激活小圆点用 `scale`、自定义按钮 `scale(.97)` 按压与 `:focus-visible` 焦点环、主题切换表面过渡、刷新时的旋转指示。
- **两条红线**：① 所有入场动画用 `animation-fill-mode: backwards`，结束后不锁死 transform，hover / active 仍生效；② `prefers-reduced-motion` 除 duration 外，把 `animation-delay`、`transition-delay`、`animation-iteration-count` 一并清零——旧版只清 duration，交错动画在系统减弱动效下仍会等待。
- **金额严格性**：明确不做数字滚动 / 逐帧计数，动画只负责进出场，任何时刻显示都是真实值。
- **验证**：`npm run lint` 0 阻断、`npm run verify` **90/90**（新增「动效系统」7 项：关键帧不含布局属性、减弱动效清零、backwards 保护 hover、transition 不加 key、shimmer 无 background-position、图表动效、无数字滚动）、`npm run build` 通过；另核对构建产物中 scoped 关键帧被 Vue 重写后定义与引用一致（`cal-cell-in-68860380`）。
- git 提交：`f88a10c`（动效）、文档同步另计。可用 `npm run dev -- --port 5178` 本地预览。

