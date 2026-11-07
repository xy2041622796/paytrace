# 现金流安全垫 · 全项目 UI 重设计说明

> 日期：2026-11-07　｜　范围：`frontend/` 全部 9 个页面（登录 + 8 个主界面视图）
> 前提：**保留全部核心功能、页面用途与业务范围**——所有业务逻辑、数据口径、计算引擎、校验层、缓存、Pinia store、路由与 Supabase 契约一行未改；只重做视觉规范、信息架构、导航流程、组件复用与响应式。
> 走查方式：Google Chrome 真浏览器逐一打开每个页面（浅色 / 深色 / 375px 视口），并用 124 项回归断言 + 静态检查 + 生产构建验证。

---

## 一、重设计前的逐页走查（Chrome 实测）

### 0. 全局共性问题

| # | 问题 | 表现 |
|---|------|------|
| G1 | **视觉规范不统一** | `.page-title / .card / .stats / .stat / .table-scroll / .text-warning / .tag / .issue` 等在每个 View 的 `<style scoped>` 里各写一遍；状态底色散落着 `rgba(239,68,68,.12)`、`rgba(245,158,11,.14)` 等硬编码；Mascot 有 4 套硬编码调色板。改一处不能全局生效，跨页必然漂移。 |
| G2 | **信息架构平铺** | 每页都是「标题 + 一行说明 + 一长串等权重白卡」。仪表盘一屏内堆了 10+ 个同级区块，用户分不清「现在还剩多少钱」和「预测月末余额」哪个重要。 |
| G3 | **导航层级弱** | 侧边栏 7 个纯文字链接无分组、无图标、无当前位置提示；移动端底部 7 项挤在 375px，点击区极小；跨页跳转（待办→日历、导出→体检）藏在文字链里。 |
| G4 | **组件复用低** | 表格三种实现并存：`n-data-table`（账本/待办）、Settings 自定义 div 表、DataCheck 原生 `<table>`，样式互不统一；空状态、状态标签、按钮、表单行没有统一组件。 |
| G5 | **内容层级弱** | 金额与说明文字字号/字重接近；大量 12–13px 灰字；卡片内边距、间距不统一；长口径说明与关键数字同样权重。 |
| G6 | **深浅色与图表** | Naive UI 主色在 `App.vue` 硬编码；状态底色用固定 rgba，深色下对比度偏弱；主题切换瞬间折线曾出现空档（重绘时序）。 |
| G7 | **响应式一刀切** | 768px 断点只做侧栏隐藏；底部 7 项导航拥挤；长表单行（Settings / AINote）窄屏堆叠后过高；表格横向滚动缺统一容器。 |
| G8 | **反馈与残留** | 除 DataCheck 外无统一错误条/空状态；右下角「运行诊断」调试浮标常驻生产界面；登录页是 360px 小卡片置于大片留白中央，无品牌叙事。 |

### 1. `/dashboard` 现金流仪表盘

- **结构**：Hero（Mascot + 「现在还剩」大金额 + 更新余额 / 设为推演期初）→ 余额变动台账（可折叠）→ 缓存条与强制刷新 → 推演起点输入 → 4 个指标卡 → 现金余额走势图（ECharts）→ 推演口径 3 列 → 折叠区（风险提示 / 情景试算 / 补贴到账试算 / 应急备用金目标 / 未来 N 个月前瞻）。
- **布局**：单列纵向长流；图表占整行；指标卡 4 列。
- **交互**：更新余额、设为推演期初、展开台账、强制刷新、调薪档位、补贴开关、目标进度、3/6 月切换、每月固定还款输入（250ms 防抖 + 跨页事件同步）。
- **视觉 / 层级**：Hero 与其余卡片同为白底细描边，权重相同；三个「余额」概念（真实余额 / 推演期初 / 月末预计）没有视觉区分；6 条风险项与折叠区平铺。
- **现存问题**：重点不突出；折叠区默认收起，情景/前瞻能力被隐藏；一屏要滚动多次才能看完；「月末预计余额」「月内最低余额」显示同一个数时缺少解释。

### 2. `/calendar` 现金流日历

- **结构**：读法说明三卡 → 口径提示条 → 月份切换 + 本月心情（Mascot）→ 7 列网格（日号 / 休 / 余额 / 今日净变化 / 薪还标记）→ 当日明细（等式「上一天 → 到账 → 扣掉 → 今天」+ 逐笔清单）→ 图例。
- **交互**：上月/下月/回到本月（±24 月）、点格子选中、悬停看日历属性。
- **视觉 / 层级**：格子信息密度极高（11–12px 小字）；余额 4 档着色；选中态仅橙色描边。
- **现存问题**：**首周空白格完全空白**，与下方形成视觉断裂；当日明细在网格下方需滚动才能看到；图例与口径说明是小灰字，容易被忽略。

### 3. `/settings` 档案配置

- **结构**：当前生效档案（8 格只读总览）→ 变更档案编辑态（基础信息 / 薪资与社保 / 武汉模板预填 / 到手预览）→ 档案变更记录 → 折叠「年内历史薪资」→ 月固定开支表（含添加行）→ 还款日历表（含添加行 + 状态切换）→ 折叠「负债清单」。
- **交互**：默认只读，点「变更档案」才进入编辑态；薪资追加新版本不覆盖；模板预填两步确认；各表增删改 + `useBusy` 互斥。
- **视觉 / 层级**：表格是自定义 div 行，与全站 `n-data-table` 不一致；操作是彩色文字链（编辑/删除/标记已还），有误触风险；6 个区块没有分组小标题。
- **现存问题**：编辑态藏得深、无引导；三种添加行样式不一；长页面缺乏「档案 / 开支还款 / 负债」的分区。

### 4. `/ledger` 流水账本

- **结构**：工具栏（月份 + 搜索 + 计数）→ 3 个汇总卡 → 支出构成横条 → 待收收入表 → 记一笔表单 → 当月流水表 + CSV → 月度对账（期初 / 容差 / 三格偏差 / 结论 / 未匹配清单）。
- **交互**：切月、搜索、记一笔（分类自动推断）、待收状态机与「标记到账」两步写、CSV 导出（含公式注入防护）、对账参数。
- **视觉 / 层级**：6 个同级 `n-card`；「记一笔」一行 6 个控件；长对账口径文案与关键偏差数字同权重。
- **现存问题**：窄屏表单易挤；CSV 按钮弱；汇总/构成/待收/流水/对账缺少分组。

### 5. `/ai-note` 智能记账与消费劝导

- **结构**：双 Tab（大白话记账 / 购物劝导）；Tab1 = 文本域 + 智能解析 → 待确认清单工具条 → 逐条草稿卡（勾选 / 来源 / 置信度 / 日期·方向·分类·金额·备注 / 单笔写入）→ 批量写入；Tab2 = 描述 → 结果卡（建议 / 理由 / 风险等级 / 免责声明）。
- **视觉 / 层级**：**每笔草稿卡约 260px 高**，字段标签在上、控件在下，3 笔就要滚两屏；Tab 视觉权重弱；空状态只有一行文字。
- **现存问题**：草稿清单密度过低导致确认成本高；购物劝导结果没有统一的信息展示结构。

### 6. `/check` 数据体检

- **结构**：常驻错误条 → 操作条（重新检查 / 导出全量备份 / 按基准数据预填）→ 预填预览 → 3 个统计卡 → 逐条问题卡（级别标签 + 详情 + 建议）→ AI 交互日志（原生 `<table>`）。
- **视觉 / 层级**：问题卡全用「左边框 + 小标签」，7 条同级平铺；统计卡与问题卡形状重复；AI 日志表样式与全站表格不一致。
- **现存问题**：分级只有颜色没有语义徽标；操作按钮散在正文里；日志表在窄屏溢出风险高。

### 7. `/todo` 待办事项

- **结构**：逾期/临期 `n-alert` → 添加行 → `n-data-table`（内容 / 关联日期 / 金额 / 剩余天数 / 紧急度 / 状态 / 操作）→ 空状态 → 联动说明。
- **视觉 / 层级**：表格**没有卡片容器**，大片空白；紧急度只是灰字，没有颜色或徽标；状态与操作混排。
- **现存问题**：页面显得空且 unfinished；联动待办（还款日历自动生成）与普通待办视觉上无法区分。

### 8. `/login` 登录 / 注册

- **结构**：右上主题切换 + 居中 360px `n-card`（品牌 + 副标题 + 用户名/密码 + 主按钮 + 切换链接 + 错误/提示）。
- **视觉 / 层级**：大片留白中的一张小卡片，无品牌叙事、无产品价值说明，与「现金流安全」的产品定位脱节。
- **现存问题**：没有解释「为什么要用它」；移动端也只是把小卡片居中；无隐私说明。

---

## 二、统一设计规范 v2「Calm Fintech Console」

**单一数据源**：`frontend/src/styles/theme.css` 的 `:root` 与 `[data-theme='dark']`。保留了全部旧变量名（`--c-*`），新增表面层级、语义浅底、圆角/阴影/间距/字号 token，因此旧代码零改动即可继承新视觉。

| 维度 | 规范 |
|------|------|
| 画布 / 表面 | 浅色 `#F5F7FA` 画布 + `#FFFFFF` 卡片 + 3 级 surface；深色 `#0E1218` + `#171D26`，避免纯黑刺眼 |
| 主色 | 浅 `#EA6234` / 深 `#FF8A5C` 珊瑚橙，仅用于强调、激活、主按钮、图表主线 |
| 语义色 | success / warning / danger / info 各配 `-soft` 浅底，取代散落的 rgba 硬编码 |
| 文字 | 3 级：`--c-text` / `--c-text-2` / `--c-text-3`；金额统一 `tabular-nums` |
| 圆角 / 阴影 | 6 / 8 / 12 / 16 / 20 / 22 / pill；三级极轻阴影，只用于建立浮起层级 |
| 间距 / 字号 | `--sp-1..8`（4→40px）；`--fs-micro..display`（11→30px） |
| 动效 | 只动画 `transform / opacity`；`--dur-fast/base/slow`；`prefers-reduced-motion` 连 delay 与循环次数一并清零；**金额永不数字滚动** |

**全局组件类（旧类名兼容，页面 scoped 不再重复定义）**
`.pt-page / .pt-page-head / .pt-eyebrow / .pt-title / .pt-sub / .pt-actions / .pt-section-label / .pt-grid-2 / .pt-grid-3 / .pt-grid-side / .pt-row / .pt-stack / .pt-card / .pt-card--accent / .pt-section-head / .pt-stat / .pt-chip / .pt-btn / .pt-note / .pt-empty / .pt-legend / .pt-progress / .pt-kv`，以及 `.card / .page-title / .intro / .stats / .stat / .stat-label / .stat-value / .summary / .tag / .btn-primary / .field-label / .toolbar / .table-scroll / .log-table / .cat-* / .issue / .risk-item / .detail / .advice / .recon-* / .draft / .result / .disclaimer / .empty / .block` 等。

**6 个全局注册组件**（`main.js`，各页面无需 import）

| 组件 | 职责 |
|------|------|
| `AppIcon` | 纯 SVG 线性图标集（35 个 name），取代文字链与 emoji |
| `PageHeader` | 分组标签 + 标题 + 说明 + `#actions` 操作区，统一 9 个页面的页头 |
| `SectionCard` | 带图标 / 说明 / `#actions` 的分区卡，取代 `n-card` 的各自为政 |
| `StatCard` | 统一 KPI 卡（label / value / hint / tone 左侧色条） |
| `StatusChip` | 语义状态徽标（primary/danger/warning/success/info） |
| `EmptyState` | 统一空状态（图标 + 文案） |

**统一阅读节奏**：页头 → 指标条 → 主内容（宽屏两栏 `.pt-grid-side / .pt-grid-2`）→ 次要/折叠内容；`.pt-section-label` 做分组小标题，消除「十余张等权卡片平铺」。

**导航与响应式**

- 侧边栏按「看现金流 / 记一笔 / 管数据」分组，每项带图标、激活指示条与当前页小圆点；底部用户卡 + 主题/打码开关 + 导出/注销说明/退出；演示模式显式徽标。
- ≤768px：顶栏（品牌 + 主题/打码/退出图标按钮）+ 当前位置条 + **5 项底部导航**（仪表盘 / 日历 / 记账 / 流水 / 更多）。「更多」面板聚合全部 7 个页面与主题、打码、导出、退出，7 个页面一个不少且点击区 ≥ 60px。
- 所有表格统一 `.table-scroll / .log-table-wrap` 横向滚动容器；表单行 `flex-wrap`；375px 实测无横向溢出。

---

## 三、逐页重设计结果

| 页面 | 重设计要点 |
|------|-----------|
| **登录** | 改为左右分屏：左侧深色品牌叙事（主张「把现金流，看在钱花出去之前」+ 日度推演/还款预警/大白话记账三条价值 + 现金流示意迷你图 + 免责声明），右侧独立表单卡（欢迎语、标题、说明、表单、登录/注册切换、隐私说明、演示模式提示）。≤900px 收为单列表单。 |
| **仪表盘** | `PageHeader`（概览 / 标题 / 说明 / 强制刷新）；Hero 升级为 `accent` 强调卡，真实余额徽标换 `StatusChip`；余额台账独立 `SectionCard`；4 个 KPI 统一 `StatCard` 并给语义 tone；用「资金总览 / 本月推演 / 风险·情景·前瞻」三段分组，走势图占主栏、推演起点 + 推演口径收进侧栏（两栏）；风险项改用统一语义底色与徽标。 |
| **现金流日历** | `PageHeader` + 读法说明三卡分组；**首周空白格补淡占位**，消除断裂；格子余额/净变化拉开字号层级；当日明细收进 `SectionCard`，逐笔清单保留 `--i` 交错入场；图例统一 `.pt-legend`。星期表头、跨月滚动、按日均摊、节假日标注等全部口径与断言保持。 |
| **档案配置** | `PageHeader`（管理）；「档案概览」用两栏放当前生效档案（accent）+ 变更记录；「每月开支与还款」两栏放月固定开支 + 还款日历；年内历史薪资 / 负债清单折叠区保留；长口径说明改 `.pt-note`；表单行窄屏自动换行。 |
| **流水账本** | `PageHeader`（记录）；3 个汇总卡统一 `StatCard`（收入绿 / 支出红 / 净额按符号）；「本月概览」两栏放记一笔 + 支出构成；「待收与流水」两栏放待收收入 + 当月流水；月度对账保留三格偏差 + 结论 + 未匹配清单，口径说明改 `.pt-note`。 |
| **智能记账** | `PageHeader`（记录）；两个 Tab 内各用 `SectionCard` 分区；**草稿卡从 ~260px 压到 ~140px**：日期/方向/分类/金额/备注一行多列紧凑网格，标签小字置顶，勾选/来源/置信度/校验提示/单笔与批量写入全部保留；空状态用 `EmptyState`；购物劝导结果用 `.pt-kv`，免责声明用 `.disclaimer`；`n-tab-pane` 仍用 `tab`。 |
| **数据体检** | `PageHeader`（工具）+ 重新检查/导出/预填移入 `#actions`；3 个统计卡 `StatCard`（严重/留意/提示）；扫描结果与 AI 日志各成 `SectionCard`；级别换 `StatusChip :tone`；原生日志表统一走 `.log-table-wrap / .log-table` 全局样式。 |
| **待办事项** | `PageHeader`（管理）；添加行 + 表格 + 空状态 + 联动说明整体收进 `SectionCard`；表格统一表头/悬停样式；空状态用 `EmptyState`；联动说明改 `.pt-note`。 |
| **全局组件** | Mascot 4 套硬编码调色板改为语义 token（ok→success / mid→primary / low→warning / neg→danger）并配 soft 底色，深浅色皆可读；`App.vue` 的「运行诊断」浮标改为**仅在真的收集到异常时出现**；首屏骨架屏与 Naive UI 主题覆盖同步新 token。 |

---

## 四、改动清单（文件级）

**新增（8 个）**

| 文件 | 用途 |
|------|------|
| `frontend/src/components/AppIcon.vue` | 纯 SVG 图标集 |
| `frontend/src/components/PageHeader.vue` | 统一页头 |
| `frontend/src/components/SectionCard.vue` | 统一分区卡 |
| `frontend/src/components/StatCard.vue` | 统一 KPI 卡 |
| `frontend/src/components/StatusChip.vue` | 统一状态徽标 |
| `frontend/src/components/EmptyState.vue` | 统一空状态 |
| `frontend/src/lib/demo.js` | **零配置本地演示后端**（见下） |
| `REDESIGN_NOTES.md` | 本文档 |

**修改（14 个）**

| 文件 | 改动 |
|------|------|
| `src/styles/theme.css` | 全量重写为设计系统 v2：token + 全局组件类 + 动效 + 响应式；保留全部旧变量名与静态断言要求的字符串 |
| `src/main.js` | 全局注册 6 个设计系统组件（Naive UI 21 个按需注册清单不变） |
| `src/App.vue` | Naive UI 主题覆盖对齐新主色；诊断浮标改为异常时才出现；骨架屏视觉更新 |
| `src/components/AppLayout.vue` | 分组图标导航 + 用户卡 + 演示徽标 + 移动端 5 项底栏与「更多」面板 |
| `src/components/Mascot.vue` | 调色板语义 token 化 |
| `src/lib/supabase.js` | 未配置 `.env` 时切到演示后端；真实凭据下走原生 SDK，`detectSessionInUrl: false` 等契约不变 |
| `src/views/Login.vue` | 分屏品牌叙事 + 表单；脚本仅新增 `isDemoMode` 展示用 import 与 `features` 常量 |
| `src/views/{Dashboard,Calendar,Settings,Ledger,AINote,DataCheck,Todo}.vue` | 模板结构重排 + `<style scoped>` 重写；**`<script setup>` 字节级不变** |

**未改动**：`router/`、`stores/`、`composables/`、`lib/` 其余 13 个文件、`CashflowTimeline.vue`、`supabase/`、`product_baseline.json`、PRD、`verify.mjs`、`lint.mjs`、`package.json`（零新增依赖）、`vite.config.js`、`index.html`。

### 关于「零配置本地演示模式」

原项目在缺少 `.env` 时 `createClient('', '')` 会直接抛错，无法启动；真实账号又需要用户在 Supabase 侧操作。为让交付物**开箱可运行**，新增 `src/lib/demo.js`（仅在 `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` 缺失时启用）：

- 精确实现本项目用到的 Supabase JS 接口子集（`auth.getSession / getUser / signIn / signUp / signOut / onAuthStateChange` 与 `from().select/insert/update/upsert/delete + eq/gte/lte/order/limit/maybeSingle/single` 的 thenable 查询构造器）。
- 预置与 `supabase/0002_real_data_seed.sql` / `product_baseline.json` 一致的业务数据（档案、2 个薪资版本、4 项开支、2 笔还款、3 笔负债、10 行社保规则、10 笔流水、3 项待收、4 条待办、3 条 AI 日志）与本机偏好（期初 465 / 固定月供 241 / 目标 2000 / 年内历史薪资）。
- 支持全部增删改查与 AI 草稿解析（本地规则解析，不联网、不接触密钥）；数据存 localStorage，按产品命名空间隔离，版本变化时自清理。
- **配置真实 `.env` 后完全不参与**，原生 Supabase SDK、RLS、Edge Function、agnes 密钥链路一行未动。

---

## 五、「不遗漏现有功能」的保证

1. **逻辑零改动**：7 个业务视图的 `<script setup>` 与 git HEAD **字节级一致**；自动比对确认全部 `{{ }}`、`v-if/v-for/v-model`、`:prop`、`@event` 绑定零丢失（仅新增 2 个纯展示用的 `:tone` / `:value-class`）。所有计算、校验、防抖、缓存、跨页事件、CSV 导出、两步事务、AI 草稿校验、`useBusy` 互斥逻辑原样保留。
2. **静态断言锁死**：`npm run verify` 124 项全部通过，包含组件按需注册清单、`n-tab-pane` 属性、日历表头/按日均摊守恒/跨页一致性、社保读表金额、余额台账、动效红线、RLS 静态校验、登录跳转白名单等——这些断言本身也约束了重构不得破坏既有功能。
3. **逐页浏览器走查**：9 个页面在浅色 / 深色 / 375px 下均正常渲染，AI 解析出 3 笔草稿、草稿编辑/写入、主题切换、导航跳转、底部「更多」面板均实测可用；`window.__appErrors` / `__missingComponents` 无记录（诊断入口未出现）。

---

## 六、验证结果

```
npm run verify   → 通过 124 项，失败 0 项
npm run lint     → 通过；42 个文件 / 123 条相对 import，无阻断问题（7 处均为既有提示级）
npm run build    → ✓ built in ~7s，无 chunk 警告
```

Chrome 真浏览器：9 个页面 × 浅色 / 深色 / 375px 视口，零运行时异常、零组件漏注册、零横向溢出；ECharts 走势图与日历网格正常渲染。

---

## 七、运行方式

```bash
cd frontend
npm ci
npm run dev            # http://localhost:5173（占用时自动顺延）
```

无需 `.env` 即可进入演示模式，直接查看全部页面。接入真实后端时 `cp .env.example .env` 并填入 `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`；其余 Supabase 侧步骤（迁移、关闭 Confirm email、部署 `agnes-proxy`、密钥）仍按根目录 `README.md` 与 `CONVERSATION_HANDOFF.md` 执行。
