# D：Supabase 正式接入与验收记录

已连接项目 `yladshlpuspylvexuial` 的公开配置，PR #6（`dff220b`）已合并并由 Actions [39955623998](https://github.com/agamma233/mpa-wrongbook/actions/runs/39955623998) 成功部署。默认不上传；生产 UI 提供 GitHub 登录和单独的备份/许可流程。真实数据库和匿名 HTTP 验证通过；用户确认授权后，真实 Chrome GitHub OAuth PKCE 已成功回到 Pages 子路径，显示正确账号，且登录后仍未允许上传。真实设备验收未完成。

## 接入步骤

1. 在自己的新 Supabase 项目审核并运行 schema.sql。它为两张暴露表启用 RLS，authenticated 仅 SELECT 自己的数据，anon 无表或 RPC 权限。公开 append/pull 是 SECURITY INVOKER；仅私有 schema 内的窄写入函数使用 DEFINER，以免给客户端直接 INSERT/UPDATE 权限；固定空 search_path，全部关系带 schema，用户仅由 auth.uid() 派生。private schema 不加入 API Exposed schemas。
2. Auth → Providers 配置 GitHub OAuth，回调填写 Supabase 提供的 callback。在 Auth URL configuration 加入正式 Pages 地址 `https://agamma233.github.io/mpa-wrongbook/`，测试回调也显式列出。不要把 GitHub OAuth client secret 放前端。
3. 只向前端提供项目 HTTPS 根地址和 publishable key（旧项目允许 role=anon 的 legacy JWT）。factory 在创建 SDK client 前校验 key 类型，拒绝 service-role/secret/数据库密码。不要将真实项目管理凭据提交到仓库。
4. 由接入方显式调用 `createCloudWorkspace({createClient,url,key,anonymous,onState})`，其中 createClient 来自审核固定版本的官方 Supabase JS SDK，anonymous 为当前 RecordStore。`login(redirectTo)` 默认 GitHub，只登录、不上传。
5. 登录后先 `selectUser` 打开独立账号库，匿名记录不自动复制。首次启用调用 `enable({saveBackup,confirmUpload})`：UI 下载当前账号完整 v3，用户选择已保存的文件读回校验，再明确确认上传。回调不能预设 true。会话与 PKCE 校验器使用独立 IndexedDB，关闭重开可恢复；不从记录备份导入会话或许可。
6. 登录后的 UI 使用 workspace.store（独立账号 DB），切换等待本机保存；失败草稿阻止切换。退出调用 logout 并切回匿名库，各库和 outbox 均保留。已启用账号可在同浏览器刷新恢复；暂停或退出撤销许可，再启用须重新备份确认。
7. 可选在 Realtime publication 中只加入 wrongbook_sync_heads；未启用 Realtime 时定时拉取仍工作。客户端只将事件当提示，重连订阅、前台和每5秒兜底拉取。不要把题库、原卷搬入 Supabase。

## 可靠性与安全验收

RPC 每用户 head 行 FOR UPDATE 锁，在同一事务分配连续 commit_seq、插入不可变操作、更新 head；无普通 sequence。唯一键(user_id,op_id)，同ID同JSON返回确认，同ID异内容或答题ID异内容拒绝并回滚整批。HLC顺序发送笔记父版本，RPC校验父引用。拉取分页按已提交 seq；本地 applyRemote 在同一个 IndexedDB 事务写入操作、投影和游标，重复页校验内容后跳过，失败不推进。

Outbox 绑定当前用户；请求前后核对会话与 epoch，每个 RPC 显式固定已核对会话的 Authorization，防止 SDK 在切号瞬间更换请求身份；退出/切号停止 sender、订阅及定时器，进行中的网络请求尽力取消。各账号 DB 不混合；备份中的 owner/actor/已发标志不可信。恢复操作重新进入当前目标用户的 outbox。批次最多100项、1.5MB，RPC最多2MB。云故障不影响本地保存。

`node tests/cloud-sql.mjs` 在 PGlite 的 PostgreSQL WASM 引擎执行真实 SQL、角色/grants/RLS：anon拒绝、A/B隔离、禁止客户端修改日志/head、重复确认、冲突和非法批次原子回滚、父版本、答题冲突与分页通过。单连接 WASM 不能证明真实 PostgreSQL 多连接锁竞争，需在真实测试项目用两个并发事务（一个延迟提交）复验不漏读。

`node tests/cloud.mjs` 和 `BROWSER_ENGINE=webkit node tests/cloud.mjs` 覆盖 SDK 模拟、公开key限制、GitHub登录、拒绝上传、强制先备份、账号DB/outbox、退出切号停止、游标原子性、重复页及不信任恢复元数据。未替代真实 OAuth、真实 anon/两账号 REST 越权、Realtime 断线及双设备验收。真实 OAuth/设备未通过的部分继续标记未验证，默认不允许上传。

## 免费额度与维护

2026-10-23 核对官方价格页：Free 每项目500MB数据库、5GB普通流出、5GB缓存流出、1GB文件存储，50,000 MAU、Realtime每月200万消息/200并发；2个活跃免费项目，闲置1周暂停，无自动备份/PITR。这里只存个人操作，字体/题库/原卷仍由 Pages 承载。操作和冲突不自动回收，持续输入会增长数据库；定期检查用量、备份、暂停恢复、OAuth配置及依赖安全，免费不等于免维护。

来源：[价格](https://supabase.com/pricing)、[额度](https://supabase.com/docs/guides/platform/billing-on-supabase)、[RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)、[函数权限](https://supabase.com/docs/guides/database/functions)、[GitHub OAuth](https://supabase.com/docs/guides/auth/social-login/auth-github)。上线前重新核对。

## 回滚

调用 stop/destroy 并关闭登录上传入口即可回到本地；保留所有匿名/账号数据库、旧localStorage键、未发送outbox、v3备份。不要删表/库或把UI退回只读旧键。需要恢复账号数据时，先导出该账号 workspace.store 的完整备份，再在正确账号确认目标后导入。SQL权限错误应修正并重跑负例，不扩大anon权限或使用service-role替代。

补充本地保护：重复 v3 导入不创建新提交序号/检查点；旧 localStorage 被浏览器策略禁止时紧急导出仍能保存草稿。真实双标签 UI 测试验证普通编辑只延续选定笔记分支，显式解决冲突才引用所有 heads；持久化 HLC 覆盖关闭重开、回拨及接收未来时钟后继续编辑。

## D 正式接入增量（2026-10-23）

沿用已有本地存储、outbox、SQL 和传输架构，仅补充登录、许可、账号切换和官方 SDK 接线。

- 官方 `@supabase/supabase-js` 固定 **2.118.0**，直接复用 npm 官方 UMD 原件，MIT 许可证随包保留；`tests/cloud-ui.mjs` 检查与安装包字节一致。SDK 随公开摘要缓存，无 CDN 运行时依赖。
- `web/cloud-config.js` 只含项目 URL、Publishable key 和传输开关。对应真实项目 `yladshlpuspylvexuial`，Pages 回调为 `https://agamma233.github.io/mpa-wrongbook/`；Supabase Site URL 和 redirect allowlist 已核对，GitHub provider 已启用。
- PKCE 校验器和会话存入独立 IndexedDB，支持同浏览器导航/重开；回调通过 SDK 兑换并清理 URL。Safari 与主屏幕安装可能使用不同站点存储，必须分别登录，不能跨浏览器完成同一次 PKCE。
- 登录立即打开 `mpa-wrongbook-v3:user:<uuid>`，不复制匿名记录、不发送个人操作。需迁移匿名数据时先匿名导出，再登录并主动导入。不同账号的库、outbox、游标和启用许可独立。
- 首次启用需下载当前账号完整 v3，再选择已保存文件逐字验证，最后勾选上传确认。备份后记录若变化需重新下载验证。许可仅保存于当前账号数据库，不从备份恢复；同浏览器刷新/新标签会恢复已启用状态。退出或暂停撤销自动恢复许可，保留所有数据与待发送项。
- 发送复用 outbox 的固定 opId、精确确认、抖动退避、超时/断网补发。Realtime 只通知同步头；前台每 5 秒补拉，另有启动、pageshow、online 和手动重试。远端操作与游标在同一事务落库。云失败不会撤销本机保存，网络等待不锁编辑界面。
- SW 继续严格限于公开文件白名单；带查询的 OAuth 回调、Authorization 请求、跨域 Supabase、Auth/REST/Realtime 请求均不进入缓存。更新不改个人数据库。

真实项目已存在 `schema.sql` 对应表/RPC，未覆盖重建。已执行 `supabase/realtime.sql`，仅发布受 RLS 约束的同步头。`supabase/verify-transaction.sql` 已在真实 Dashboard 运行通过：anon 拒绝、两个**合成数据库身份**相互隔离、RPC 幂等、碰撞拒绝、禁止直接修改；fixture 在事务中回滚，最终确认清理完成。线上三个函数体 MD5 均与仓库一致，search_path 为空。真实 Chrome 对两张表及 append/pull RPC 的匿名 HTTP 请求均返回 401。该验证不代表两个真实 GitHub 账号登录通过。

新增自动回归使用官方 SDK 和**模拟 HTTP**测试 PKCE、会话恢复、备份与许可、独立账号、断网/刷新/补发及同 context 双标签。WebKit 下需禁用该测试 context 的 SW，否则 Playwright 不能完整拦截由 SW 控制页面发出的请求；真正 SW 行为由独立 Chromium/WebKit PWA 套件覆盖，不能据此声称真实 OAuth 或双设备通过。

真实 GitHub OAuth、Supabase HTTP/Realtime、iPhone Safari/主屏幕和 MacBook 双设备结果，以 `docs/MANUAL-ACCEPTANCE.md` 最新记录为准；未填写通过的项目仍未验证。

回滚：优先在当前 UI 点击“暂停云同步”；发布紧急停传时将 `cloudConfig.enabled` 改为 `false`，仍保留账号选择/本机 IndexedDB 适配器。禁止整体回退到旧的匿名专用 UI。保留匿名库、全部账号库、auth 库、旧 localStorage、outbox、游标、冲突和 v3 文件；不删除云表或重置游标。恢复时重新备份并明确启用；备份的账号/设备/发送标记与许可均不可信。
