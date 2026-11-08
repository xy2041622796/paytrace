# 现金流安全垫 · 个人薪资现金流管理

> 一句话定位：把桌面 Excel《个人薪资现金流管理表 V7》产品化的 Web 工具——面向现金流紧张的新入职人群，提供多租户的**现金流日度推演 + 还款预警 + 薪资情景模拟 + AI 自然语言记账**，核心是「现金流安全」而非普通记账。

## 技术栈

- 前端：Vue 3 + Vite + vue-router（hash 模式）+ Pinia + Naive UI（主题橙 `#FF6B35`，按需引入）+ ECharts（按需引入）+ `@supabase/supabase-js`
- 后端：Supabase（Postgres + Auth + RLS 多租户隔离 + Edge Functions）
- AI：`agnes-3.0-flash`，经 Edge Function `agnes-proxy` 服务端代理调用；密钥只在 Supabase Secrets，绝不落地前端
- 部署：前端静态托管 / Vercel；后端 Supabase 云
- 依赖版本：`vue ^3.4.31` / `pinia ^2.3.1` / `vite ^5.3.3` / `@supabase/supabase-js ^2.43.4` / `naive-ui ^2.38.2` / `echarts ^5.5.1`

## 目录树

```
paytrace/
├─ README.md                          # 本文件（项目说明）
├─ REDESIGN_NOTES.md                  # 全项目 UI 重设计：逐页走查、设计规范、改动说明与验证结果
├─ CONVERSATION_HANDOFF.md            # 对话交接文档（历史 18 轮，§19 为 2026-11-05 本轮）
├─ 薪资现金流管理产品_PRD.md           # PRD v1.2（FR-01~17 + 第十六章偏差核对）
├─ product_baseline.json              # 真实数据语义化基准（武汉江汉区社保口径、字段含义）
├─ 个人薪资现金流管理表V7.xlsx         # 原始需求来源
├─ .gitignore
├─ .github/workflows/ci.yml           # CI：Node 20，verify → lint → build
├─ supabase/
│  ├─ migrations/0001_init.sql        # 11 张表 + RLS + 武汉社保模板 + 2026 双休日历 + 新用户触发器
│  ├─ migrations/0003_analytics_and_liability.sql  # 埋点表 + 负债月供列（增量、可重复执行）
│  ├─ 0002_real_data_seed.sql        # 真实数据种子（幂等，限定单个 user_id）
│  └─ functions/agnes-proxy/         # AI 代理：记账解析 / 购物劝导 + 日志 + 降级
│     ├─ index.ts
│     └─ README.md
└─ frontend/
   ├─ .env                           # 本机已填 VITE_SUPABASE_URL / ANON_KEY（公开 anon key，已加入忽略）
   ├─ .env.example
   ├─ index.html
   ├─ package.json / package-lock.json
   ├─ vite.config.js                 # manualChunks：charts / ui / framework / supabase / vendor
   ├─ verify.mjs                     # 124 项回归断言（esbuild + data URL，无需临时文件）
   ├─ lint.mjs                       # 零依赖静态检查
   ├─ README.md                      # 前端说明
   └─ src/
      ├─ main.js / App.vue / router/
      ├─ stores/{auth,app,theme}.js
      ├─ composables/{useCashflow,useProjection,useMediaQuery,useBusy}.js
      ├─ lib/{supabase,date,constants,holidays2026,insurance,validation,reconcile,prefs,baseline,labels,privacy,aiDraft,cache,analytics,reminders,flowChannel,categoryHabits}.js
      ├─ components/{AppLayout,CashflowTimeline}.vue
      └─ views/{Login,Dashboard,Calendar,AINote,Ledger,Settings,DataCheck,Todo}.vue
```

## 本地运行步骤

```bash
cd frontend
npm ci                      # 用现有 package-lock.json，零新增依赖
npm run dev                 # http://localhost:5173（端口占用时自动顺延）
```

> **零配置可运行**：未填 `.env` 时前端自动进入「本地演示模式」（`src/lib/demo.js`），预置与真实种子一致的业务数据，可直接走查全部 9 个页面与增删改查；数据仅存浏览器 localStorage。侧边栏会显示「演示模式」标识。需要接入真实后端时再执行 `cp .env.example .env` 并填值，配置后走原生 Supabase SDK。

`.env`（可选）只需两个变量：

```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=xxxx-anon-key
```

> agnes 的 API Key 只配置在 Supabase 后台 Secrets（见 `supabase/functions/agnes-proxy/README.md`），**绝不**出现在前端。

## Supabase 侧步骤（按顺序）

1. **迁移**：Dashboard → SQL Editor → 全量执行 `supabase/migrations/0001_init.sql`（建表 + RLS + 新用户触发器）。若该库此前跑过旧版迁移（无 `username` 列），改用交接文档 §6 B 的增量补丁补列，**不要整份重跑**（否则 `create policy` 会报 already exists 并回滚）。
2. **关邮箱验证**：Authentication → Providers → Email → 取消 **Confirm email**（及 Double confirm email）→ Save。这是 `用户名@paytrace.local` 别名登录的前提。
3. **部署 agnes-proxy + 设 Secret**：

   ```bash
   supabase login
   supabase functions deploy agnes-proxy
   supabase secrets set AGNES_API_KEY="<从 agnes 控制台获取>"
   ```

   函数名必须是 `agnes-proxy`（前端 `callAgnes` 拼的是 `/functions/v1/agnes-proxy`）；密钥只写入 Supabase Secrets，任何仓库文件都不得出现明文。
4. **种子 SQL**：执行 `supabase/0002_real_data_seed.sql`。执行前先到「数据体检」页点「导出全量备份」；第 0 段为破坏性清理，可单独跳过。SQL 由用户在 SQL Editor 执行，本仓库不代执行。
5. **增量迁移（埋点 / 负债月供）**：执行 `supabase/migrations/0003_analytics_and_liability.sql`（`create table if not exists` + `add column if not exists`，可重复执行、无破坏性清理）。不执行也能正常运行：埋点自动降级到本机队列并在「数据体检 → 埋点事件」可见，负债月供走本机偏好。
6. **增量迁移（关键数据后端化）**：执行 `supabase/migrations/0004_backend_prefs.sql`。它给 `profiles` 增加 `current_balance` / `recurring_repayment` / `salary_ytd` 三列、新建 `balance_log` 表（余额变动台账），并把用户的真实初值（20 / 241 / 7-10 月历史薪资）写入**所有** profile（不写死某个 UUID，避免漏掉真实注册账号）。幂等、可重复执行、无破坏性清理。**此后这三项不再只存浏览器**：前端写时同步写 Supabase，读时优先读后端，换设备 / 清缓存不丢。
7. **补查询索引**：执行 `supabase/migrations/0005_query_indexes.sql`。给 `transaction` / `repayment_event` / `liability` / `pending_income` / `todo` / `salary_config` / `expense_category` / `ai_interaction_log` 补 `user_id` 索引（`ai_interaction_log` 加 `(user_id, created_at)` 支撑限流计数）。幂等、可重复执行、无破坏性清理。

### SQL 变更清单（按执行顺序）

| 文件 | 用途 | 执行方式 | 幂等 |
| --- | --- | --- | --- |
| `supabase/migrations/0001_init.sql` | 11 张表 + RLS + 新用户触发器 + 武汉社保模板 + 2026 日历 | 首次，SQL Editor 全量执行（旧库跑过无 `username` 列版本时改用增量补丁，勿整份重跑） | 部分（含 `create policy`，重跑会 already-exists） |
| `supabase/0002_real_data_seed.sql` | 真实业务数据种子 | 首次，SQL Editor 执行（第 0 段破坏性清理可跳过） | 幂等（upsert 风格） |
| `supabase/migrations/0003_analytics_and_liability.sql` | 埋点表 + 负债月供列 | 增量，SQL Editor | 是 |
| `supabase/migrations/0004_backend_prefs.sql` | `profiles` 三列 + `balance_log` 表 | 增量，SQL Editor | 是 |
| `supabase/migrations/0005_query_indexes.sql` | 补 `user_id` 查询索引 | 增量，SQL Editor | 是 |

> 当前所有 SQL 均经 Dashboard → SQL Editor 手动粘贴执行（本地 Supabase CLI 未登录、anon key 不能跑 DDL，无法 `supabase db push`）。后续可接入 GitHub Actions / CLI 做自动迁移，消除「人工粘贴顺序易漏」的隐患。

8. **重新部署 agnes-proxy + 设 CORS 白名单**（账户注销功能用户决策不做，无需部署）：

   ```bash
   supabase functions deploy agnes-proxy        # 本轮重写过，必须重新部署
   supabase secrets set ALLOWED_ORIGINS="https://你的域名,http://localhost:5173"
   ```

   agnes-proxy 校验 Origin 白名单；未配置 `ALLOWED_ORIGINS` 时跨域一律 403，本地开发务必把 `http://localhost:5173` 加进去。

## 数据口径（2026-11-05 校准）

- **按日均摊**：餐饮等每天发生的月固定开支按当月天数均摊，28 / 29 / 30 / 31 天月份全月合计精确守恒，一分不丢。
- **跨月滚动**：上月结余作为下月期初；`buildProjection()`（仪表盘 / 多月前瞻）与 `buildMonthProjection()`（现金流日历）共用统一推演入口，杜绝同一月出现两个预测值。
- **关键数据后端化**：当前余额 / 每月固定还款 / 年内历史薪资（`current_balance` / `recurring_repayment` / `salary_ytd`）已落到 `profiles`，余额变动历史落到 `balance_log` 表（见迁移 `0004`）；前端以 Supabase 为权威源、localStorage 仅作离线兜底，不再「只存前端」。
- **社保比例读表**：比例由 `insurance_rule` 表读取，并计算公司缴纳，不再依赖前端硬编码比例（换城市更准）。
- **节假日静态表**：`holidays2026.js` 已对照国务院办公厅《关于 2026 年部分节假日安排的通知》逐条核验（法定假 + 6 个调休补班日）；**2027 数据仅元旦保守兜底，待补全**（RK-06）。日历属性仅用于展示，不挪动资金日期。
- **发薪 / 还款遇休**：按交接文档 §11.2 的用户决策「照发 / 不顺延」，不做日期挪动。
- **个税**：累计预扣法，支持录入年内真实历史薪资后精确重算；未录入时假设年内每月薪资相同。
- **回归断言**：`frontend/verify.mjs` 共 **124 项**（含安全与隔离 9 项、智能分类 4 项、分类习惯 6 项、AI 日期兜底 4 项、看得懂的现金流 6 项、余额变动台账 5 项，以及社保/个税/日历/校验/动效等既有断言），覆盖社保口径、累计预扣、按日均摊守恒、跨月一致性、账号隔离、HTML 转义、CORS、防抖、分类归一化、习惯记忆、日期合理性、逐笔明细、当前余额隔离、界面读法与台账精度 / 链条核对。

## 本轮改动（2026-11-08）

- **金额全局联动（单一数据源）**：此前真实余额 / 推演期初 / 情景滑块三处各存各的，导致「仪表盘改了金额，日历不变」。现已统一：
  - 仪表盘「现在还剩」更新后**自动同步推演期初**，仪表盘 / 日历 / 多月前瞻从同一笔钱往后算；
  - 调薪 / 补贴情景滑块参数持久化，日历的 `buildMonthProjection` 现在读取并传入——**拖滑块日历每日余额同步重算**；
  - 偏好写入内置广播事件，同标签页实时刷新已具备（非 bug）。
- **首页聚焦**：移除首屏冗余的「推演起点」卡、「只读口径」卡、「设为推演期初」按钮（真实余额已自动同步期初）；走势图改为全宽，余额变动台账默认收起。首屏只留：实时余额 + 4 个核心指标 + 还款提醒 + 走势图 + 风险提示。
- **日历等式措辞**：当日明细从「上一天结束时 / 这天到账 / 这天扣掉 / ＝ 这天结束时」改为「**前一天余额 / 当日进账 / 当日支出 / ＝ 当日余额**」，摘要句「这天」统一为「当日」。
- **部署路径纠正**：`agnes-proxy` 经 Supabase Dashboard 在线编辑器（单文件 + 纯 URL import）直接部署，无需 CLI；已确认 `AGNES_API_KEY` 存在、`ALLOWED_ORIGINS=http://localhost:5173` 已设、新版已重新 Deploy（OPTIONS 预检 `Access-Control-Allow-Origin` 回显本地源验证通过）。
- **关键数据后端化**：当前余额(465) / 每月固定还款(241) / 年内历史薪资(7-10月) 此前只存浏览器，已新建迁移 `0004` 落到 `profiles`（`current_balance` / `recurring_repayment` / `salary_ytd`）+ `balance_log` 表；前端以 Supabase 为权威源、localStorage 仅作离线兜底，换设备 / 清缓存不再丢。偏好 API 表面不变，所有调用方无需改动。
- **数据核对**：对照 `个人薪资现金流管理表V7.xlsx` 与 `0002_real_data_seed.sql` + `baseline.js` 初值，库内业务数据全部对齐；`465 当前余额 / 241 每月固定还款 / 7-10 月历史薪资` 属前端偏好（非库表），`11.1 话费充值 100` 为一次性现金流出、需在流水账本手动补记才能与 xlsx 推演的 `-47.05` 对齐（详见下节「数据体检」）。

## 验证命令

```bash
cd frontend
npm run verify   # 124 项回归断言（纯函数 / 口径）
npm run lint     # 零依赖静态检查（console.log / tab 属性 / weekOrder / import 路径）
npm run build    # vite build → dist/
```

CI（`.github/workflows/ci.yml`）在 Node 20 下依次执行 `npm ci` → `npm run verify` → `npm run lint` → `npm run build`。

## 动效与可访问性

- 纯 CSS `transform` / `opacity` + Vue `<transition>`，**零新增依赖**；关键帧不动画任何布局属性。
- 页面 / 卡片入场、登录↔主界面过渡、日历格子按 `--i` 交错浮现、ECharts 折线逐点绘出、骨架屏 shimmer 改用 transform、导航激活指示与按压 / 焦点反馈。
- 入场动画一律用 `animation-fill-mode: backwards`，动画结束后不锁死 `transform`，hover / active 反馈仍然生效。
- 系统开启「减弱动态效果」时，动画时长、**延迟**与循环次数一并清零（旧版只清了 duration，交错动画仍会等待）。
- **金额不做数字滚动**：动画只负责进出场，任何时刻屏幕上的数字都是真实值，不会出现「中间金额」误导。
- 以上约束由 `frontend/verify.mjs` 的「动效系统」一节静态锁死。

## 仍需用户本人在 Supabase / agnes 控制台完成的事项

> 以下操作需要账号权限或密钥，Agent 无法代执行；代码侧已全部就绪。

1. **真实账号六项全链路验收**（见交接文档 §6 E）：仪表盘读出真实数据、档案保存不刷新自动联动、流水账本记一笔 / 切月 / 搜索 / CSV、标记到账两步写一致性、智能记账 AI 解析 → 草稿 → 写入 `transaction`、深浅主题 / 375px / 数据体检 / 全量备份。2026-11-08 已在真实账号（非模拟会话）下完成 9 个页面走查，含 AI 解析 / 草稿编辑、流水与待收编辑、主题切换；但完整六项验收仍需按本节逐条签核。
2. **agnes 密钥轮换**：历史明文值应视为已泄露，请在 agnes 控制台轮换，并同步更新 Supabase Secret `AGNES_API_KEY`。
3. **重新部署 agnes-proxy**（`supabase functions deploy agnes-proxy`），启用「一句话多笔」解析；不重新部署也能正常使用，只是每次解析一笔。
4. **上线部署**：前端静态托管（hash 路由已兼容，无需 rewrite）；确认 `Confirm email` 已关、`AGNES_API_KEY` 已设。
5. **对照工资条核对 4 个社保基数**（养老 4552、医疗 / 失业 4498、公积金 2400）与**年内历史薪资**（各月税前与五险一金），必要时在「档案配置 → 年内历史薪资」更新。
6. **执行 `0003` 与 `0004` 增量迁移**（均幂等、可重复执行）：`0003` 增加埋点表与负债月供列；`0004` 把当前余额 / 每月固定还款 / 年内历史薪资与余额变动台账搬到后端 `profiles` + `balance_log`。未执行 `0004` 前这三项仍只存浏览器，换设备 / 清缓存会丢。账户注销功能用户决策不做，无需部署。
7. **补齐 2027 年节假日数据**：在 Supabase `holiday_calendar` 表按国务院办公厅通知逐条录入；前端会自动用表覆盖本地静态表，未覆盖年份按双休兜底并在日历页提示。

## 合规与红线

- 个人财务数据仅本人可见（RLS 强制 `auth.uid()=user_id` 隔离）；AI 输出均带「仅供参考 / 不承诺收益」声明，低置信记账只给草稿、确认后才落库。
- agnes 密钥绝不落地前端；前端 `.env` 仅放公开 anon key。
- 「注销账户」用户决策不实现：前端侧边栏仅保留一行静态说明（如需删除数据走 Supabase 控制台 / 联系维护者），不提供自助注销入口，也不接触管理密钥。
