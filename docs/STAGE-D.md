# D：可选 Supabase 适配交付（未真实联调）

没有创建或连接真实 Supabase 项目，没有上传个人记录。本阶段包含 `web/cloud.js`、`supabase/schema.sql`、PostgreSQL WASM 安全测试和浏览器模拟验收。已发布 app.js 不导入 cloud.js，默认仅本地。A/B/C 不需要 D。

## 接入步骤

1. 在自己的新 Supabase 项目审核并运行 schema.sql。它为两张暴露表启用 RLS，authenticated 仅 SELECT 自己的数据，anon 无表或 RPC 权限。公开 append/pull 是 SECURITY INVOKER；仅私有 schema 内的窄写入函数使用 DEFINER，以免给客户端直接 INSERT/UPDATE 权限；固定空 search_path，全部关系带 schema，用户仅由 auth.uid() 派生。private schema 不加入 API Exposed schemas。
2. Auth → Providers 配置 GitHub OAuth，回调填写 Supabase 提供的 callback。在 Auth URL configuration 加入正式 Pages 地址 `https://agamma233.github.io/mpa-wrongbook/`，测试回调也显式列出。不要把 GitHub OAuth client secret 放前端。
3. 只向前端提供项目 HTTPS 根地址和 publishable key（旧项目允许 role=anon 的 legacy JWT）。factory 在创建 SDK client 前校验 key 类型，拒绝 service-role/secret/数据库密码。不要将真实项目管理凭据提交到仓库。
4. 由接入方显式调用 `createCloudWorkspace({createClient,url,key,anonymous,onState})`，其中 createClient 来自审核固定版本的官方 Supabase JS SDK，anonymous 为当前 RecordStore。`login(redirectTo)` 默认 GitHub，只登录、不上传。
5. 登录完成后单独调用 `enable({saveBackup,confirmUpload})`：saveBackup 必须把传入的完整 v3 备份实际下载/保存成功后返回 true；confirmUpload 必须明确展示当前账号与匿名记录数量，用户再次确认后才返回 true。示例回调不能预设 true。SDK/确认 UI 未接入生产，因此目前无实际登录上传入口。factory 的 OAuth 会话/PKCE 使用当前标签页 sessionStorage，不写入 localStorage；关闭标签页后需重新登录，个人记录仍在各自 IndexedDB。
6. 启用后 UI 切换使用 workspace.store（用户独立 DB），停止使用匿名 store 编辑。退出调用 logout 并切回匿名 store，销毁页面调用 destroy。不同账号的数据库和 outbox 分离；重新登录仍需备份与明确确认。匿名记录不会因退出而清除。
7. 可选在 Realtime publication 中只加入 wrongbook_sync_heads；未启用 Realtime 时定时拉取仍工作。客户端只将事件当提示，重连订阅、前台和每5秒兜底拉取。不要把题库、原卷搬入 Supabase。

## 可靠性与安全验收

RPC 每用户 head 行 FOR UPDATE 锁，在同一事务分配连续 commit_seq、插入不可变操作、更新 head；无普通 sequence。唯一键(user_id,op_id)，同ID同JSON返回确认，同ID异内容或答题ID异内容拒绝并回滚整批。HLC顺序发送笔记父版本，RPC校验父引用。拉取分页按已提交 seq；本地 applyRemote 在同一个 IndexedDB 事务写入操作、投影和游标，重复页校验内容后跳过，失败不推进。

Outbox 绑定当前用户；请求前后核对会话与 epoch，退出/切号停止 sender、订阅及定时器，进行中的网络请求尽力取消。各账号 DB 不混合；备份中的 owner/actor/已发标志不可信。恢复操作重新进入当前目标用户的 outbox。批次最多100项、1.5MB，RPC最多2MB。云故障不影响本地保存。

`node tests/cloud-sql.mjs` 在 PGlite 的 PostgreSQL WASM 引擎执行真实 SQL、角色/grants/RLS：anon拒绝、A/B隔离、禁止客户端修改日志/head、重复确认、冲突和非法批次原子回滚、父版本、答题冲突与分页通过。单连接 WASM 不能证明真实 PostgreSQL 多连接锁竞争，需在真实测试项目用两个并发事务（一个延迟提交）复验不漏读。

`node tests/cloud.mjs` 和 `BROWSER_ENGINE=webkit node tests/cloud.mjs` 覆盖 SDK 模拟、公开key限制、GitHub登录、拒绝上传、强制先备份、账号DB/outbox、退出切号停止、游标原子性、重复页及不信任恢复元数据。未替代真实 OAuth、真实 anon/两账号 REST 越权、Realtime 断线及双设备验收。真实项目验收前保持关闭。

## 免费额度与维护

2026-10-23 核对官方价格页：Free 每项目500MB数据库、5GB普通流出、5GB缓存流出、1GB文件存储，50,000 MAU、Realtime每月200万消息/200并发；2个活跃免费项目，闲置1周暂停，无自动备份/PITR。这里只存个人操作，字体/题库/原卷仍由 Pages 承载。操作和冲突不自动回收，持续输入会增长数据库；定期检查用量、备份、暂停恢复、OAuth配置及依赖安全，免费不等于免维护。

来源：[价格](https://supabase.com/pricing)、[额度](https://supabase.com/docs/guides/platform/billing-on-supabase)、[RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)、[函数权限](https://supabase.com/docs/guides/database/functions)、[GitHub OAuth](https://supabase.com/docs/guides/auth/social-login/auth-github)。上线前重新核对。

## 回滚

调用 stop/destroy 并关闭登录上传入口即可回到本地；保留所有匿名/账号数据库、旧localStorage键、未发送outbox、v3备份。不要删表/库或把UI退回只读旧键。需要恢复账号数据时，先导出该账号 workspace.store 的完整备份，再在正确账号确认目标后导入。SQL权限错误应修正并重跑负例，不扩大anon权限或使用service-role替代。

补充本地保护：重复 v3 导入不创建新提交序号/检查点；旧 localStorage 被浏览器策略禁止时紧急导出仍能保存草稿。真实双标签 UI 测试验证普通编辑只延续选定笔记分支，显式解决冲突才引用所有 heads；持久化 HLC 覆盖关闭重开、回拨及接收未来时钟后继续编辑。
