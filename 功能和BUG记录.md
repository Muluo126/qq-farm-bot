# 功能和BUG记录

## 2026-03-01 23:25
### BUG修复：后端端口被占用 (EADDRINUSE)
- **原因**：后端默认运行在 3000 端口，该端口已被系统中其他进程占用。
- **思路**：
    1. 观察到用户将前端 `vite.config.js` 的代理目标修改为了 `3030`。
    2. 需要引导用户通过环境变量 `PORT` 来更改后端的运行端口，使其与前端代理配置一致。
- **修复步骤**：
    1. 在启动后端时指定环境变量，例如：`PORT=3030 npm start`。
    2. 如果使用 Docker，修改 `docker-compose.yml` 中的端口映射和环境变量。

## 2026-03-02 20:00
### 功能：实现账号设置与统计数据持久化
- **背景**：之前程序重启或账号重登后，功能开关、每日统计和奖励领取状态会丢失。
- **思路**：
    1. 在 `database.js` 中为 `users` 表增加了 `feature_toggles`、`daily_stats` 和 `daily_reward_state` 列。
    2. 修改 `bot-instance.js`，在功能开关更新、统计数据变化、奖励领取时触发事件。
    3. 修改 `bot-manager.js`，监听上述事件并将数据实时保存到数据库；在启动（包括自动启动）和重启 Bot 时，从数据库加载这些状态并还原。
- **改动步骤**：
    1. 修改 `server/database.js` 以支持新列的自动迁移。
    2. 修改 `server/bot-instance.js` 以支持在构造时传入初始配置并发布更新事件。
    3. 修改 `server/bot-manager.js` 以负责在 Bot 生命周期中进行数据的读写同步。
- **后续优化 (2026-03-02 21:00)**：修复了扫码重新登录（QR 登录）时未读取 DB 历史配置的问题，以及 Bot 停止状态下 API 获取快照数据没从 DB 加载的 Bug。

## 2026-03-02 20:50
### BUG修复：BotInstance.js 语法错误 (Unexpected token '{')
- **原因**：在实现数据持久化功能改动代码时，于 `handleNotify` 方法下方误插入了一个多余的闭合花括号 `}`，导致 `BotInstance` 类被提前关闭，其后的所有成员方法（如 `sendLogin`）变成了非法的顶层定义。
- **思路**：
    1. 根据报错信息准确定位到 `bot-instance.js` 第 457 行附近。
    2. 检查大括号匹配情况，发现 451 行有多余的 `}`。
    3. 全局检查类结构，确保所有方法都在类的主体内，且最底部有且仅有一个闭合整个类的大括号。
- **修复步骤**：
    1. 删除 `server/bot-instance.js` 中第 451 行多余的大括号。
    2. 验证文件末尾的大括号闭合逻辑正确。
## 2026-03-02 22:15
### 优化：移动端统计页面适配与 UI 细节修复
- **背景**：原统计页面在手机端排版错乱，且部分 UI 组件（如气泡悬浮窗）在深色模式或小屏幕下存在可视性及展示不全的问题。
- **思路与步骤**：
    1. **响应式布局实现**：将 `AccountStats.vue` 中的固定栅格（`:span`）更新为响应式属性 (`:xs`, `:sm`, `:md`, `:lg`)，使统计卡片和图表在小屏下能够自动堆叠。
    2. **气泡状态改善**：
        - 引入 `mobileWidth` 计算属性，动态撑开手机端的悬浮窗宽度。
        - 对 `.crop-name` 应用 `word-wrap: break-word`，确保长名称自动换行。
    3. **深色模式视觉修正**：
        - 去除 `el-popover` 的强制深色效果，使其背景跟随各系统的主题设置。
        - 将悬浮窗内的文字颜色修正为深灰色 (`#ff0000`)，解决了在浅色气泡背景下由于文字也是白色导致的“不可见”问题。
- **结果**：显著提升了移动端用户的统计数据查阅体验，确保了跨平台、跨主题的 UI 一致性。

## 2026-03-02 22:40
### BUG修复：Docker 容器内日志时间错误 (慢 8 小时)
- **原因**：Docker 容器默认使用的是 UTC 时区，而中国处于东八区 (UTC+8)。
- **修复步骤**：
    1. 修改 `docker-compose.yml`，在 `environment` 部分增加 `TZ=Asia/Shanghai` 环境变量。
- **结果**：重启容器后，日志时间将与宿主机（北京时间）同步。

## 2026-03-02 23:15
### 功能：统计页面增加每日历史汇总表
- **背景**：用户希望查看长期的经营收益趋势，不仅限于最近 24 小时。
- **思路与步骤**：
    1. **后端聚合**：在 `database.js` 增加 `getDailyStatistics` 函数，利用 SQL `date()` 函数对 `bot_statistics` 行为进行按天归档汇总。
    2. **接口开发**：新增 `GET /api/accounts/:uin/daily-statistics` 接口。
    3. **前端渲染**：在 `AccountStats.vue` 底部新增汇总表格，展示最近 7 天的收获数量、偷菜数量及每日总收益金币。
- **结果**：用户现在可以直观地对比每天的收益波动，方便进行长期经营规划。

## 2026-03-02 23:18
### BUG修复：ReferenceError: getDailyStatistics is not defined
- **原因**：在实现每日汇总功能时，错误地将 `getDailyStatistics` 函数嵌套定义在了 `getHourlyStatistics` 函数体内部，导致其无法在模块范围内被正确访问和导出。
- **思路**：定位嵌套位置并将其移动到模块级作用域，确保导出对象 `db` 能正确引用。
- **修复步骤**：
    1. 在 `server/database.js` 中将 `getDailyStatistics` 移出 `getHourlyStatistics`。
- **结果**：后端服务现在可以正常启动。

## 2026-03-02 23:20
### BUG修复：统计页面超时 (Timeout) 且数据丢失
- **原因**：在添加 `daily-statistics` 路由时，误将原有的 `statistics` 路由覆盖删除。由于统计页面的主图表和主表依然依赖原路由，导致请求无法正常得到响应（可能在某些网络环境下触发了超时 hang 住），从而造成数据加载失败。
- **思路**：恢复被误删的 API 路由，确保两个统计接口共存。
- **修复步骤**：
    1. 在 `server/routes.js` 中重新添加 `GET /api/accounts/:uin/statistics` 路由。
- **结果**：统计页面数据恢复正常，超时问题解决。

## 2026-03-03 10:08
### BUG修复：每日汇总统计数量对不上（时区偏差）
- **原因**：`getDailyStatistics` 函数的 SQL 使用 `datetime('now', '-7 days', 'localtime')` 作为过滤条件，但 SQLite 的 `datetime('now')` 基于 UTC，`'localtime'` 只影响显示格式，不影响 `-7 days` 偏移量的计算基准。在 UTC+8 时区下，每天的截止点有 8 小时的偏差，导致记录被划入错误的天。
- **修复步骤**：
    1. 修改 `server/database.js` 中的 `getDailyStatistics` 函数。
    2. 改为在 Node.js 中计算起始日期字符串（使用本地时间），然后用 `date(created_at) >= ?` 进行日期字符串比较，完全绕过 SQLite 的时区运算问题。
- **结果**：每日汇总数据现在按北京时间的自然天切割，数量统计准确。

## 2026-03-04 15:50
### 功能：账号掉线邮件通知
- **背景**：用户希望账号异常断线时能收到邮件提醒，方便及时处理。
- **架构思路**：
    1. 邮件 SMTP 发送参数（服务器、端口、账号、授权码）通过环境变量 `MAIL_HOST` / `MAIL_USER` / `MAIL_PASS` 配置，安全且部署灵活。
    2. 接收通知的邮箱地址和开关，存储在 SQLite 的 `system_settings` 表里，通过后台管理页面的 UI 随时修改。
- **实现步骤**：
    1. 创建 `server/email-service.js`（nodemailer 封装，读取环境变量）。
    2. 修改 `server/database.js`：新建 `system_settings` 通用配置表，实现 `getMailSettings` / `saveMailSettings`。
    3. 修改 `server/routes.js`：新增 `GET /api/admin/settings/mail` 和 `PUT /api/admin/settings/mail` 接口。
    4. 修改 `server/bot-manager.js`：监听 `statusChange` 事件，当账号从 `running` 变为 `error` 时自动调用邮件发送。
    5. 修改 `docker-compose.yml`：以注释形式补充邮件 SMTP 环境变量示例。
    6. 修改 `web/src/views/AdminUsers.vue` 和 `web/src/api/index.js`：在管理页面新增"掉线邮件通知"配置卡片，支持在线设置收件邮箱和开关。
- **结果**：账号异常断线后，系统会以 HTML 邮件形式通知指定邮箱，包含账号昵称、断线时间和原因。

## 2026-03-05 01:35
### 新功能添加：支持 QQ Code 登录 (WSS Code)
- **背景**：QQ 扫码登录方式目前已失效，无法正常登录。
- **思路**：参考微信登录方式，将 QQ 登录改为通过手动输入 WebSocket (WSS) 抓取的 `code` 进行登录。
- **修改内容**：
    1. 后端 `server/routes.js`：修改 `/api/accounts/add-by-code` 路由，增加对 `platform` (qq/wx) 和 `uin` 参数的支持。
    2. 前端 `web/src/components/QrCodeDialog.vue`：将 "微信Code登录" 修改为 "Code 登录"，增加平台切换（QQ/微信）和 QQ 号输入框。
    3. 前端 `web/src/views/DashboardView.vue`：适配后端 API 参数变更。
- **修复原因**：解决原始 QQ 扫码登录接口无法工作的问题，提供备选登录方案。

## 2026-03-06 14:54
### BUG修复：游戏版本更新导致 QQ 平台好友巡查失败
- **问题描述**：游戏更新版本后，QQ 平台使用原来的 `FriendService.GetAll` API 无法获取好友列表，导致好友巡查功能失效。
- **修复思路**：
    1. 分析补丁文件，发现 QQ 平台需要改用 `FriendService.SyncAll` API 获取好友列表。
    2. 微信平台仍然使用原来的 `FriendService.GetAll` API。
- **修复步骤**：
    1. 在 `proto/plantpb.proto` 中新增 `CheckCanOperateRequest`/`CheckCanOperateReply` 消息定义。
    2. 在 `src/proto.js` 中注册 `SyncAllFriendsRequest/Reply` 和 `CheckCanOperateRequest/Reply` 类型。
    3. 修改 `server/bot-instance.js` 中的 `getAllFriends()` 方法，根据 `this.platform` 判断平台，QQ 平台使用 `SyncAll`，微信平台使用 `GetAll`。
    4. 新增 `checkCanOperateRemote()` 方法，用于预检查某个操作是否可执行。
- **造成BUG的原因**：游戏服务端更新了 QQ 平台的好友列表 API 接口，原 `GetAll` 接口不再适用于 QQ 平台。

## 2026-03-06 15:29
### 新功能添加：定时汇报邮件系统
- **功能描述**：自动定时生成汇报邮件并发送，支持每小时整点汇报和每日早 8 点汇报。
- **汇报内容**：
    - 收获作物统计（按作物类型分类，含金币收入）
    - 偷菜作物统计（数量和收入）
    - 偷菜好友排行榜（Top 10）
    - 当前所有账号状态（等级、经验、金币、在线状态）
- **实现方式**：
    1. 新建 `server/report-service.js`：核心汇报模块，包含定时调度器（整点对齐 + 每日 8:00）、数据采集、HTML 邮件模板、失败重试机制（3 次）
    2. 扩展 `server/database.js`：新增 `getReportStatistics(hours)` 跨账号聚合统计、`getStealRanking(hours)` 偷菜排行、`getReportSettings/saveReportSettings` 设置存取
    3. 扩展 `server/email-service.js`：新增通用 `sendMail()` 方法
    4. 更新 `server/routes.js`：新增汇报设置 API（GET/PUT `/api/admin/settings/report` + POST `/api/admin/report/test`）
    5. 更新 `server/index.js`：集成调度器启停
    6. 前端 `AdminUsers.vue`：新增「定时汇报」设置卡片（每小时/每日开关 + 测试按钮）

## 2026-03-06 16:00
### BUG修复：重新登录导致账号功能开关和配置重置
- **原因**：前端组件（二维码或 Code 登录框）在提交时总是携带默认的 `farmInterval` 和 `friendInterval` 参数。且在后端 `server/routes.js` 中的 `/api/accounts/add-by-code` 接口中，直接使用该参数并**未读取数据库中已有的功能开关（feature_toggles）等配置进行传递**，导致 `BotInstance` 被初始化为了没有任何自定义功能开关的默认状态。随后产生的 `settingsUpdate` 事件又将这套默认状态覆写回了数据库，从而造成原有配置实质性丢失。
- **思路**：
    1. 修正前端 `QrCodeDialog.vue` 的逻辑：针对已存在账号的扫码/Code重新登录时，不再强制上报巡查间隔参数（除非是全新手动添加），从而给后端保留按DB配置启动的口子。
    2. 修正后端 `server/routes.js` 逻辑（主要是针对 `add-by-code` 等非扫码恢复途径）：在预备启动 `BotInstance` 时，先从数据库查询该账号的已有全量配置信息（如 `feature_toggles`、`daily_stats` 等），并将其合并注入到 `startOpts` 中。
- **修复步骤**：
    1. 前端 `web/src/components/QrCodeDialog.vue` 修正了 `handleSubmit` 和 `handleManualSubmit` 的传参，移除了强制覆盖。
    2. 后端 `server/routes.js` 中补充了在 `botManager._startBot(...)` 前加载并合并数据库配置文件的代码段。
## Bug 修复: 测试汇报发送失败 (500错误)
- **时间**: 2026-03-06 16:38:12
- **原因**: `report-service.js` 中的 `collectReportData` 方法在遍历账号列表时，错误地使用了 `acc.userId` 来获取账号标识（`botManager.listAccounts()` 返回的对象中该属性名为 `uin`），导致传给数据库查询的参数为 `undefined`，触发 `better-sqlite3` 的 `Wrong API use : tried to bind a value of an unknown type` 报错，从而抛出 500 异常。
- **修复步骤**: 在 `server/report-service.js` 中将 `const uin = acc.userId;` 修改为 `const uin = acc.uin || acc.userId;`，并将 `nickname: acc.nickname || acc.userId` 修正为 `nickname: acc.nickname || uin`。

## 2026-03-06 19:48
### BUG修复：收获与偷菜统计出现“果实1101”等非作物数据污染
- **原因**：后端返回的收获或偷菜物品列表（`reply.items`）中，不仅包含农作物，还会同时返回金币（id为1或1001）和经验值（id为2或1101）等非游戏作物。原代码在遍历 `items` 统计数据时，直接使用 `getFruitName(id)` 并回退到“未知果实(id)”处理，未过滤掉金币和经验，导致此类数据一直被误认作收成记录并推送到数据库，污染了统计数据。
- **思路**：
    1. 在 `bot-instance.js` 解析收成 `reply.items` 和偷菜 `totalStolenItems` 时进行拦截。
    2. 发现 `id` 为 `1, 1001, 2, 1101` 等特定系统数值时直接 `continue` 跳过，不计入统计累加中。
- **修复步骤**：
    1. 修改 `server/bot-instance.js` 第 980 行（自动收获数据处理）的 `for` 循环，增加 `// 过滤金币、经验等非作物掉落`。
    2. 
## 2026-03-06 20:35
### 版本发布：v2.0.0
- **主要更新**：
    1. **定时汇报系统**：支持每小时和每日早 8 点自动发送统计邮件。
    2. **QQ Code 登录**：解决原扫码失效问题，支持通过 WSS Code 登录 QQ。
    3. **持久化增强**：修复了重登后配置重置的 Bug，确保账号设置、统计数据完美持久化。
    4. **好友巡查修复**：适配 QQ 平台最新的 `FriendService.SyncAll` 接口。
    5. **数据清洗**：自动过滤统计中的金币、经验等非作物干扰项。
- **发布操作**：推送代码并打标签 `v2.0.0`。

## 2026-03-07 16:18
### 功能隔离与优化：隔离 QQ 扫码登录并优化启动流程
- **原因**：用户反馈登录时有概率弹出二维码，且希望隔离 QQ 扫码登录相关功能。同时指出当前 session 无法复用于重新登录，因此需要点击启动时能直接输入新的 Code。
- **思路**：
    1. **触发 Code 弹窗**：修改前端“启动”按钮逻辑，不再直接尝试后台重启，而是直接弹出已切换为 Code 模式的登录对话框。
    2. **隔离扫码选项**：在“添加账号”对话框中，将“QQ扫码登录”标签页暂时注释隔离，并默认切换至“Code 登录”界面。
- **修改步骤**：
    1. 修改 `web/src/views/AccountHome.vue`：`handleStart` 函数逻辑调整，设为打开 `qrDialogVisible` 对话框。
    2. 修改 `web/src/views/DashboardView.vue`：同步调整 `handleStart` 逻辑。
    3. 修改 `web/src/components/QrCodeDialog.vue`：注释掉扫码部分，并将 `activeTab` 初始值设为 `manual`。
- **结果**：实现了一键弹出 Code 登录框，同时从源头上禁用了不可用的扫码功能。

## 2026-03-07 16:47
### 新功能：偷取作物黑名单 (Stealing Blacklist)
- **需求描述**：允许用户自定义不希望自动偷取的作物列表，并在后台过滤。
- **思路与实现**：
    1. **后端过滤**：在 `BotInstance` 的 `featureToggles` 中增加 `stealBlacklist` 数组。在巡查好友农场时的 `analyzeFriendLands` 方法中增加了黑名单校验逻辑，命中黑名单的作物将被跳过。
    2. **前端配置**：在“配置”页面 (`AccountSettings.vue`) 的参数配置区域增加了“偷取作物黑名单”多选下拉框，支持搜索和多选。
    3. **数据同步**：通过 `getCropList` 接口获取数据源，并结合 `updateToggles` 接口将配置持久化到数据库。
- **结果**：功能已正确部署在配置页面，用户可以灵活规避某些不希望偷取的作物。

## 2026-03-07 17:35
### 新功能：自定等级升级土地 (Custom Land Upgrade)
- **需求描述**：在首页提供开关，并允许用户设置土地自动升级的“最高等级”。
- **思路与实现**：
    1. **后端控制**：在 `BotInstance` 的 `featureToggles` 中增加 `landUpgradeTarget`（默认 6，蓝宝石土地）。在 `analyzeLands` 逻辑中，除了检查 `could_upgrade`，还增加了 `land.level < targetLevel` 的判断。
    2. **首页 UI**：在 `AccountHome.vue` 的“农场管理”区域，在“自动升级土地”开关下方新增了一个下拉选择框，仅在开启自动升级时显示，允许用户选择 1-6 级土地作为升级目标。
    3. **样式优化**：为子配置项增加了缩进及微调样式。
- **结果**：用户现在可以精准控制土地升级进度，避免因金币不足或策略原因错升土地。

### 2026-03-07 17:51:00 - 新增化肥容器与收藏点数据展示
- **需求**：在首页实时展示用户的化肥容器剩余时长（普通/有机）以及收藏点数值（普通/典藏），匹配原版游戏 UI 风格。
- **背景**：用户希望更直观地掌握农场资源状态，而不需要频繁进入仓库查看。
- **思路与实现**：
    1. **后端数据采集**：在 `BotInstance` 的 `userState` 中新增 `fertilizer` 和 `collectionPoints` 字段。
    2. **实时更新**：实现 `_updateExtraUserInfo` 方法，每 5 分钟（或在巡田时）调用一次。通过 `_getBag` 获取化肥容器 ID (1011, 1012) 的 `count`（即剩余秒数）；通过 `GetIllustratedListV2` 遍历已解锁项统计收藏点（Category 2 为典藏，其余为普通）。
    3. **前端 UI 展现**：在 `AccountHome.vue` 的用户信息下方新增 `extra-data-grid`。采用深色卡片风格、Element Plus 图标及动态颜色（蓝色/绿色/橙色）区分不同类别，将秒数转换为小时（.1h）单位展示。
- **结果**：首页信息更加丰富，用户可以一眼看到化肥储备和图鉴收集进度，体验大幅提升。

### 2026-03-07 18:15:00 - 修复首页启动 Bot 时 Code 登录无效并弹出二维码的 BUG
- **问题描述**：在 `AccountHome.vue`（详情页）点击启动按钮并输入 `authCode` 后，系统仍然弹出扫码二维码，且手动输入的 `authCode` 未生效。
- **原因分析**：
    1.  之前在优化启动流程时，修改了触发弹窗的逻辑，但遗漏了 `AccountHome.vue` 内部对弹窗确认事件 (`handleQrConfirm`) 的处理逻辑。
    2.  `AccountHome.vue` 原有的 `handleQrConfirm` 只会调用 `startQrLogin` (扫码登录接口)，没有判断 `form.manual` 标志位，导致其忽略了用户输入的 Code 并默认开启扫码流程。
- **修复步骤**：
    1.  在 `AccountHome.vue` 中导入 `addAccountByCode` API。
    2.  更新 `handleQrConfirm` 函数，增加对 `form.manual && form.code` 的判断。如果存在，则调用 `addAccountByCode` 进行登录，并在成功后关闭弹窗并刷新数据。
- **结果**：修复后，详情页的启动流程与首页列表保持一致，输入 Code 后可正常登录，不再弹出多余的二维码。

### 2026-03-07 19:40:00 - BUG修复：更新额外用户信息频繁报错 (Protobuf 解码异常)
- **问题描述**：日志中频繁出现 `WRN ⚙️ 系统 更新额外用户信息失败: invalid wire type ...` 或 `index out of range ...`。
- **原因分析**：
    1. **数据结构复杂**：原先采用 `GetIllustratedListV2` 接口获取图鉴列表，该接口数据量巨大且包含嵌套二进制转换，当前的 Protobuf 定义与之不兼容，导致解码失败。
    2. **冗余逻辑**：图鉴列表解码失败会拖累化肥数据的更新，并因未进入冷却期而导致高频重试。
- **思路与修复步骤**：
    1. **精简获取方案**：参考 `qq-farm-bot-ui` 仓库逻辑，发现服务器会将收藏点总分以物品 ID `3001`（普通）和 `3002`（典藏）的形式下发到背包。
    2. **重构代码**：放弃调用不稳定的图鉴接口，改为直接从 `_getBag()` 返回的背包物品中筛选 `1011`、`1012`、`3001` 和 `3002` 四个 ID。
    3. **提升稳定性**：单次背包请求即可更新所有额外状态信息，且无需处理复杂的图鉴对象，彻底解决了解码异常和日志刷屏问题。
- **造成的BUG原因**：对图鉴系统的数据下发方式理解不深，选择了最复杂的接口进行解析，而忽略了背包中已经存在的汇总数据。


### 2026-03-07 19:35:00 - BUG修复：Docker 部署后邮件发送超时 (ETIMEDOUT)
- **问题描述**：用户在 Docker 部署后，配置 163 邮箱（465 端口）发送测试汇报邮件失败，错误信息为 `Error: Timeout` 且错误代码为 `ETIMEDOUT / CONN`。
- **原因分析**：
    1. **SSL 配置冲突**：原 `email-service.js` 中硬编码了 `secure: false`。然而，SMTP 465 端口通常要求 SSL 直连（`secure: true`），强行使用非 SSL 连接会导致握手 hang 住直至超时。
    2. **超时时间过短**：原代码设置的连接超时（`connectionTimeout`等）仅为 5 秒。在 Docker 容器网络或某些 SMTP 宿主环境下，握手时间可能超过此限制。
- **思路与修复步骤**：
    1. **动态识别 SSL**：根据 `MAIL_PORT` 自动设置 `secure` 标志。如果是 465 端口则设为 `true`，其他设置为 `false`。
    2. **延长超时限制**：将 `connectionTimeout`、`greetingTimeout` 和 `socketTimeout` 统一从 5000ms 增加到 15000ms，以提高网络兼容性。
- **造成BUG的原因**：代码未适配 SSL 直连端口（465）的特殊安全要求，且超时容灾策略在复杂网络环境下过于严格。
