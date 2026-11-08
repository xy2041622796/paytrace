# 项目记忆（AI 维护）

> 本文件记录**用户决策、环境事实、工作流偏好**，由 AI 在每次开工前读取，避免重复询问或重新探测已知信息。
> 不要删除本文件；信息变更时直接更新对应章节。

## 一、用户明确决策（不要的东西 / 已否决的需求）

- **不需要「账户注销 / 删除账户」功能**（2026-11-08 明确）。
  - 原因：用户从未要求；我此前基于 PRD 第八章隐私合规自行实现，属过度实现，已回退。
  - 现状：前端侧边栏仅保留一行静态说明（告知如需删除数据走 Supabase 控制台 / 联系维护者），不提供任何自助注销入口、不调用后端、不要求部署。
  - PRD 第八章的注销要求视为「用户决策不做」，不再据此推动。
- 其余功能均按需求推进；如用户对某项明确说不要，追加到本节。

## 一之一、用户强偏好：数据必须进后端

- **所有用户数据都要落在 Supabase 后端，不能只存前端 localStorage**（2026-11-08 明确）。
  - 背景：此前「当前余额 / 每月固定还款 241 / 年内历史薪资 7-10 月」只存浏览器，用户指出换设备 / 清缓存即丢。
  - **用户当前真实现金余额（2026-11-08 自报）：20 元**（此前种子 465 已过时，0004 迁移初值已改为 20）；历史薪资 7-10 月与月固定还款 241 不变。
  - 已落地（2026-11-08）：迁移 `0004_backend_prefs.sql` 给 `profiles` 加 `current_balance` / `recurring_repayment` / `salary_ytd` 三列 + 新建 `balance_log` 表；前端以 Supabase 为权威源，localStorage 仅离线兜底。
  - **今后新增任何用户数据，默认就进后端表 + RLS，不要再设计成「仅前端存储」。** 若确有理由只存前端，必须向用户说明并经其同意。

## 二、环境事实（已确认，勿每次重新探测）

- **运行模式：真实 Supabase 模式**。`frontend/.env` 存在，含 `VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY`（此前曾误判为演示模式，已更正）。
- **Supabase 项目 ref**：`kfgcrtloejtwiehbyoqi`（从 `VITE_SUPABASE_URL` 提取）。
- **本地前端开发地址**：`http://localhost:5173`（Vite 端口，若被占用会从其它端口起，以实际为准）。
- **agnes-proxy**：函数名固定 `agnes-proxy`（前端 POST `/functions/v1/agnes-proxy`）。单文件 `index.ts` + 纯 URL import，可走 **Supabase Dashboard 在线编辑器部署**（Edge Functions 页 → 选/建 `agnes-proxy` → 粘贴 `index.ts` 全文 → Deploy），无需本地 CLI。
- **agnes-proxy Secrets（项目级，Project Settings → Edge Functions → Secrets 查看/添加）**：
  - `AGNES_API_KEY`：用户已于 2026-11-08 确认存在。
  - `ALLOWED_ORIGINS`：用户已于 2026-11-08 添加，值 `http://localhost:5173`（新版 `index.ts` 收紧 CORS，依赖此变量；改/加后无需重部署即生效，但旧版代码不读它，需先贴新版部署）。
- **account-deletion**：已删除、未采用，不要再要求部署或引用。
- **迁移 `0003_analytics_and_liability.sql`**：用户已于 2026-11-08 执行。
- **迁移 `0004_backend_prefs.sql`**：已新建（profiles 加 `current_balance`/`recurring_repayment`/`salary_ytd` + `balance_log` 表），初值 `current_balance=20` / `recurring_repayment=241` / 历史薪资 7-10 月。**已改为对所有 profile 生效（不再写死 UUID）**，避免漏掉用户真实注册账号；只对为 null 的列写，不覆盖已设值。policy 用 `drop policy if exists` 保证可重复执行。**用户在 Dashboard SQL Editor 粘贴执行即可**（anon key 不能跑 DDL，本地 CLI 未登录，无法代执行）。
- **部署 / 凭据类操作由用户自己执行**：我没有部署权限，也不应向用户索要 `SUPABASE_SERVICE_ROLE_KEY` 等密钥。我只提供命令与说明。
- 真实账号全链路已在真实会话下走查（非模拟），但六项正式验收仍未逐条签核。

## 三、工作流偏好（重要）

- **把用户提供的信息固化到项目文档 / 本文件**，不要每次交互都重新询问或重新探测。
  - 收到用户给的环境信息、决策、偏好时，立即更新本文件或对应文档，并简短告知「已记下」。
  - 开工前先读 `PROJECT_MEMORY.md`、`README.md`、`CONVERSATION_HANDOFF.md`、`product_baseline.json` 等，建立上下文。
- 遇到需要用户决策的分叉，优先用 `AskUserQuestion` 一次问清，不要反复试探。
- 不要过度实现用户没要求的功能（教训：账户注销）。

## 四、已交付功能清单（截至 2026-11-08）

- 预测引擎接入真实流水（记一笔 / AI 写入后曲线随之更新）。
- 埋点系统：7 个 PRD 事件接入 + `0003` 建 `analytics_event` 表（真实写表，降级落本机队列）。
- 还款提醒：3 天 / 1 天 / 当天 / 逾期四级 + 已读持久化 + 状态机自动流转 + 一键标记已还。
- 情景模拟：薪资 / 补贴滑块，补贴按到账日进入统一推演（不再是展示层加法）。
- 风险口径（FR-14）：对外分级标签 高/中/提示。
- 节假日（FR-15）：app store 读取 `holiday_calendar` 表动态覆盖静态表；DataCheck 显示加载状态。
- FR-16 顺延规则：按用户决策「照发/不顺延」在 UI 显式标注（不改资金日期），PRD 第十六章已注明为最终决策。
- 跨标签页流水同步（BroadcastChannel + silent 静默重拉，无循环）。
- 打码不覆盖导出：改为在 CSV / 全量备份处明确告知。
- FR-02/05：作息可配置、剩余期数按月供推导、按负债一键生成未来 3 期账单。
- 错误处理与体验修复（Todo 忽略 error、Settings 加载失败可见、auth.logout 半失败、_persist 跨账号串写、callAgnes 超时、AINote 事件广播、路由滚动重置、登录页写死数字修正）。
- **金额全局联动（2026-11-08，用户明确要求「各页面共享单一数据源，不能各自独立」）**：真实余额更新后自动同步推演期初（`saveBalance` 内 `writeStartBalance` → `writePref` 内置 `emitPrefChange` 广播），仪表盘 / 日历 / 前瞻同源重算；调薪假设 `assumePreTax` 与补贴试算 `bonus` 持久化进本机偏好（`readAssumePreTax` / `readScenarioBonus*`），日历 `buildMonthProjection` 读取并传入，拖滑块日历同步重算；同标签页刷新由 `writePref` 的 `emitPrefChange` 保证（此前误判为 bug，实际已具备）。
- **首页精简（2026-11-08）**：移除首屏「推演起点」卡片、「只读口径」卡、「设为推演期初」按钮（真实余额已自动同步期初，该入口冗余）；走势图全宽；余额变动台账默认收起。首屏聚焦：真实余额 hero + 4 核心指标 + 还款提醒 + 走势图 + 风险。
- 日历当日明细等式措辞清晰化：「前一天余额 / 当日进账 / 当日支出 / 当日余额」（原「上一天结束时 / 这天到账 / 这天扣掉 / 这天结束时」）。

## 五、已知未做 / 边界

- **双薪资版本（试用期 / 转正两套薪资 + 生效日）未做**：需改薪资版本引擎与个税累计口径，牵动 124 项断言，风险高，未与上面批量改动混做。
- **2027 节假日数据**：不能编造，等国务院办公厅通知由运营在 `holiday_calendar` 表逐条录入；前端已做接线与双休兜底提示。
- **FR-05 账单派生是手动一键生成**，不是自动写库（避免未确认就改还款日历）。
- 部署相关（已确认路径）：**agnes-proxy 走 Supabase Dashboard 浏览器在线编辑器部署**（Edge Functions 页 → `agnes-proxy` → 粘贴 `index.ts` 全文 → Deploy）。无需本地 CLI。Secrets 在 Project Settings → Edge Functions → Secrets：`AGNES_API_KEY` 已存在、`ALLOWED_ORIGINS` 已设为 `http://localhost:5173`。

## 六、代码审查修复记录（2026-11-08 收尾）

> 审查分级：P1 性能/安全（已全修）、P2 可维护性、P3 质量短板。本轮按推荐顺序收口。

- **P2-3 偏好双源解耦（已做）**：`src/lib/prefs.js` 原本在 `readStartBalance` / `readRecurringRepayment` / `readSalaryYtd` / `readCurrentBalance` 四处重复粘贴「`adapterReady()` → `getProfile()` → 列名 → null 判断」的后端优先读取逻辑，且直接硬编码后端列名。新增单一入口 `readBackendValue(column)`，所有后端优先读取统一收敛到一处，消除双重真相风险；外部行为不变（`npm run verify` 124/124 仍全过）。
- **P2-5 推演引擎巨型函数拆分（暂不做）**：`useProjection.js` 的 `buildProjection` / `buildMonthProjection` 函数体较大，但被 124 项断言锁死跨页一致性，拆分回归风险高；维持现状，待有低风险的纯函数抽取需求时再做。
- **P3 注册校验（已做）**：`Login.vue` 的 `onSubmit` 原本只判非空，弱密码 / 含空格用户名会吃到 Supabase cryptic 报错。新增 `validate()` 前置校验（用户名非空且不含空格、密码至少 6 位），把可读提示留在客户端，服务端仍是最权威校验方。
- **P3 明文 / raw_input（核查后非问题）**：密码不落 localStorage（仅走 Supabase auth）；`ai_interaction_log.raw_input` 是用户本人的 AI 输入，存于本人 RLS 行内，属正常归属数据，无需改动。
- **P3 魔法数字（核查后不改）**：`agnes-proxy` 的 `DAILY_AI_LIMIT` 已是服务端单一名为常量（Secret `AGNES_DAILY_LIMIT`，默认 50），前端不硬编码、无前后端不一致；其余魔法数字多为单点使用、语义自明，强行抽常量属过度设计。
- **P3 未纳入本轮（明确告知，非遗漏）**：引入 TypeScript、补齐正式单测、重构 `demo.js` 双份逻辑——均为大工程或纯 demo 隔离代码，按用户「不过度实现」偏好暂不碰。

## 七、验证基线

- `npm run verify` 124 项断言全过；`npm run lint`、`npm run build` 通过。
- 验证入口：前端 `verify.mjs`、`eslint`、`vite build`。
