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
├─ CONVERSATION_HANDOFF.md            # 对话交接文档（历史 18 轮，§19 为 2026-11-05 本轮）
├─ 薪资现金流管理产品_PRD.md           # PRD v1.2（FR-01~17 + 第十六章偏差核对）
├─ product_baseline.json              # 真实数据语义化基准（武汉江汉区社保口径、字段含义）
├─ 个人薪资现金流管理表V7.xlsx         # 原始需求来源
├─ .gitignore
├─ .github/workflows/ci.yml           # CI：Node 20，verify → lint → build
├─ supabase/
│  ├─ migrations/0001_init.sql        # 11 张表 + RLS + 武汉社保模板 + 2026 双休日历 + 新用户触发器
│  ├─ 0002_real_data_seed.sql        # 真实数据种子（幂等，限定单个 user_id）
│  └─ functions/agnes-proxy/
│     ├─ index.ts                     # Edge Function（parse_note / advise_purchase + 交互日志）
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
      ├─ lib/{supabase,date,constants,holidays2026,insurance,validation,reconcile,prefs,baseline,labels,privacy,aiDraft,cache}.js
      ├─ components/{AppLayout,CashflowTimeline}.vue
      └─ views/{Login,Dashboard,Calendar,AINote,Ledger,Settings,DataCheck,Todo}.vue
```

## 本地运行步骤

```bash
cd frontend
cp .env.example .env        # 已有 .env 可跳过；填入 Supabase URL 与 anon key
npm ci                      # 用现有 package-lock.json，零新增依赖
npm run dev                 # http://localhost:5173
```

`.env` 只需两个变量：

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

## 数据口径（2026-11-05 校准）

- **按日均摊**：餐饮等每天发生的月固定开支按当月天数均摊，28 / 29 / 30 / 31 天月份全月合计精确守恒，一分不丢。
- **跨月滚动**：上月结余作为下月期初；`buildProjection()`（仪表盘 / 多月前瞻）与 `buildMonthProjection()`（现金流日历）共用统一推演入口，杜绝同一月出现两个预测值。
- **社保比例读表**：比例由 `insurance_rule` 表读取，并计算公司缴纳，不再依赖前端硬编码比例（换城市更准）。
- **节假日静态表**：`holidays2026.js` 已对照国务院办公厅《关于 2026 年部分节假日安排的通知》逐条核验（法定假 + 6 个调休补班日）；**2027 数据仅元旦保守兜底，待补全**（RK-06）。日历属性仅用于展示，不挪动资金日期。
- **发薪 / 还款遇休**：按交接文档 §11.2 的用户决策「照发 / 不顺延」，不做日期挪动。
- **个税**：累计预扣法，支持录入年内真实历史薪资后精确重算；未录入时假设年内每月薪资相同。
- **回归断言**：`frontend/verify.mjs` 共 **124 项**（含安全与隔离 9 项、智能分类 4 项、分类习惯 6 项、AI 日期兜底 4 项、看得懂的现金流 6 项、余额变动台账 5 项，以及社保/个税/日历/校验/动效等既有断言），覆盖社保口径、累计预扣、按日均摊守恒、跨月一致性、账号隔离、HTML 转义、CORS、防抖、分类归一化、习惯记忆、日期合理性、逐笔明细、当前余额隔离、界面读法与台账精度 / 链条核对。

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

1. **真实账号六项全链路验收**（见交接文档 §6 E）：仪表盘读出真实数据、档案保存不刷新自动联动、流水账本记一笔 / 切月 / 搜索 / CSV、标记到账两步写一致性、智能记账 AI 解析 → 草稿 → 写入 `transaction`、深浅主题 / 375px / 数据体检 / 全量备份。此前所有浏览器验证均为**模拟会话**，只证明渲染与零异常，不能替代本节。
2. **agnes 密钥轮换**：历史明文值应视为已泄露，请在 agnes 控制台轮换，并同步更新 Supabase Secret `AGNES_API_KEY`。
3. **重新部署 agnes-proxy**（`supabase functions deploy agnes-proxy`），启用「一句话多笔」解析；不重新部署也能正常使用，只是每次解析一笔。
4. **上线部署**：前端静态托管（hash 路由已兼容，无需 rewrite）；确认 `Confirm email` 已关、`AGNES_API_KEY` 已设。
5. **对照工资条核对 4 个社保基数**（养老 4552、医疗 / 失业 4498、公积金 2400）与**年内历史薪资**（各月税前与五险一金），必要时在「档案配置 → 年内历史薪资」更新。

## 合规与红线

- 个人财务数据仅本人可见（RLS 强制 `auth.uid()=user_id` 隔离）；AI 输出均带「仅供参考 / 不承诺收益」声明，低置信记账只给草稿、确认后才落库。
- agnes 密钥绝不落地前端；前端 `.env` 仅放公开 anon key。
- 「注销账户」当前版本只提供**说明入口**，不执行删除：真正删除 `auth.users` 需 service_role 或服务端 Edge Function，前端 anon 权限做不到，避免误导。
