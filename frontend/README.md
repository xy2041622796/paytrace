# 现金流安全垫 · 前端

> Vue 3 + Vite + vue-router（hash 模式）+ Pinia + Naive UI（按需引入）+ ECharts（按需引入）+ `@supabase/supabase-js`。
> 视觉遵循极简留白（白底 + 1px 浅灰描边 + 唯一橙色 `#FF6B35`），界面全中文，与 `../supabase/` 后端配套。

## 技术栈

- Vue 3 + Vite 5
- vue-router（hash 模式，静态托管免 rewrite）
- Pinia（登录态 `auth` / 业务配置 `app` / 主题 `theme` 集中管理，跨页响应式）
- Naive UI（21 个组件具名注册、`app.component()` 按需引入，主题橙）
- ECharts（`echarts/core` 按需引入，charts 独立 chunk）
- `@supabase/supabase-js`（Auth + 数据 + 调用 Edge Function `agnes-proxy`）

## 页面（8 个）

| 路由 | 页面 | 说明 |
|------|------|------|
| `/login` | 登录 | 用户名 + 密码，独立布局 |
| `/dashboard` | 现金流仪表盘 | 日度推演、风险提示、6 个月前瞻、目标安全垫 |
| `/calendar` | 现金流日历 | 按日均摊、跨月滚动、节假日 / 调休标注 |
| `/ai-note` | 智能记账 | AI 大白话记账（可编辑草稿清单）+ 购物劝导 |
| `/ledger` | 流水账本 | 记一笔 / 月份切换 / 搜索 / CSV / 月度对账 / 待收收入 |
| `/settings` | 档案配置 | 档案版本化、薪资 / 开支 / 还款 / 负债 / 年内历史薪资 |
| `/check` | 数据体检 | 只读扫描、基准预填、全量备份导出、AI 交互日志 |
| `/todo` | 待办事项 | 临期自动置顶 |

## 登录

用户名 + 密码，内部映射为 `用户名@paytrace.local` 别名（Supabase Auth 底层身份仍是 email），用户只感知用户名；RLS / `auth.uid()` / 业务表一行未改。需在 Supabase 关闭 **Confirm email**，否则别名注册无法自动登录。所有展示用户身份的地方剥掉别名后缀，统一取 `auth.username`。

## 数据与推演口径

- **统一推演入口** `src/composables/useProjection.js`：`buildProjection()`（仪表盘 / 多月前瞻）、`buildMonthProjection()`（现金流日历跨月滚动）。两个页面共用同一份参数组装，杜绝「同月出现两个预测值」。
- **按日均摊**：月固定开支（餐饮等每天发生的开支）按当月天数均摊，28 / 29 / 30 / 31 天月份全月合计精确守恒；还款 / 发薪按账单日当天，遇休照发 / 不顺延，不挪动日期。
- **跨月滚动**：上月结余作为下月期初，日历与仪表盘前瞻数值一致；「每月固定还款」与已录入的当月账单不重复扣款。
- **个税累计预扣法**：`calcNetSalary(config, { monthIndex, ytdMonths })`，年度预扣率 7 档，本月税 = 累计税 − 上月累计税；录入年内真实历史薪资后精确重算。
- **社保比例读表**：比例由 `insurance_rule` 表读取（`src/lib/insurance.js`），并计算公司缴纳，不再前端硬编码。
- **节假日静态表**：`src/lib/holidays2026.js`，2026 法定假 / 调休补班已对照国务院办公厅通知逐条核验；2027 仅元旦兜底，待补全。
- **工程质量**：三级缓存（内存 → localStorage → Supabase，TTL 12h）、`useBusy` 写操作互斥、统一校验层 `validation.js`（宁可明确拒绝，不静默截断）、月度对账容差、统一中文映射 `labels.js`、AI / 手动记账分类自动归一（39 类默认清单 + 关键词兜底 + 习惯记忆：记住用过的分类与改过的说法，留空自动识别）。
- **金额打码**：布局里「金额打码」开关写偏好 `paytrace:pref:privacyMask`，`formatMoney` 开启时返回 `••••`（带单位 `•••• 元`）；默认关闭，Node 环境无 localStorage 时自动回退关闭。

## 目录结构

```
frontend/
├─ index.html
├─ package.json / package-lock.json
├─ vite.config.js          # manualChunks：charts / ui / framework / supabase / vendor
├─ .env.example            # 复制为 .env 填入 Supabase 值
├─ verify.mjs              # 109 项回归断言（esbuild + data URL 导入，无需临时文件）
├─ lint.mjs                # 零依赖静态检查
└─ src/
   ├─ main.js              # createApp + createPinia + 按需注册 Naive UI + 启动初始化 auth
   ├─ App.vue              # n-config-provider > message/dialog > router-view（含首屏骨架屏、全局错误入口）
   ├─ router/index.js      # 嵌套布局 + 登录守卫（getSession）
   ├─ stores/              # auth / app / theme
   ├─ composables/         # useCashflow（纯函数引擎）/ useProjection / useMediaQuery / useBusy
   ├─ lib/                 # supabase / date / constants / holidays2026 / insurance / validation /
   │                      # reconcile / prefs / baseline / labels / privacy / aiDraft / cache
   ├─ components/          # AppLayout / CashflowTimeline
   └─ views/               # Login / Dashboard / Calendar / AINote / Ledger / Settings / DataCheck / Todo
```

## 运行步骤

```bash
cd frontend
cp .env.example .env          # 填入你的 Supabase URL / anon key（本机已填可跳过）
npm ci                        # 用现有 package-lock.json，零新增依赖
npm run dev                   # http://localhost:5173
```

## 环境变量（.env）

```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=xxxx-anon-key
```

> agnes 的 API Key 只配置在 Supabase 后台 Secrets（见 `../supabase/functions/agnes-proxy/README.md`），**绝不**出现在前端。前端 `.env` 只有公开 anon key，受 RLS 保护。

## 验证与产物

```bash
npm run verify   # 109 项回归断言（社保 / 个税 / 按日均摊守恒 / 跨月一致性 / 校验层 / 组件注册）
npm run lint     # 零依赖静态检查（console.log / tab 属性 / weekOrder / 相对 import）
npm run build    # vite build → dist/
```

`dist/` 为生产构建产物，已加入 `.gitignore`；`vite.config.js` 把第三方库拆为 charts / ui / supabase / vendor 独立长期缓存 chunk，业务代码改动不会让三方库缓存失效。CI 在 Node 20 下依次执行 `npm ci` → `npm run verify` → `npm run lint` → `npm run build`。

## 已知简化项（按 2026-11-05 真实现状）

- 计算引擎仍在前端；节假日 / 调休用静态表 `holidays2026.js`（2026 已对照国务院通知核验，2027 待补全，生产应迁 `holiday_calendar` 表，RK-06）。日历属性仅用于展示，不做发薪 / 还款顺延，不影响资金金额。
- 未录入年内历史薪资时，累计预扣假设年内每月薪资相同；录入真实工资条数据后精确重算（数据体检页会主动提示）。
- 本机偏好（期初余额 / 每月固定还款 / 目标安全垫 / 年内历史薪资 / 对账容差 / 金额打码）只存 localStorage，不跨设备同步；已按 `user_id` 分域，退出登录会清空当前账号数据。
- 多月预测只统计已录入还款；未录入月份按固定开支 + 每月固定还款推演。
- `ui` 约 751 kB / `charts` 约 503 kB 为第三方库，已拆为独立长期缓存 chunk，不再继续瘦身。
- 「注销账户」仅提供说明入口，不执行删除（删除 `auth.users` 需 service_role / Edge Function，前端 anon 权限做不到）。
- AI 交互日志可在「数据体检」页查看并标记采纳状态；自动准确率统计尚未做。

## 合规提醒

- 个人财务数据仅本人可见（RLS 强制多租户隔离）。
- AI 输出均带「仅供参考、不承诺收益」声明；低置信记账仅给草稿，确认后才落库。
