# 学习系统交付与恢复（2026-10-23）

| 阶段 | 独立 PR | 交付 | 验收证据 |
| --- | --- | --- | --- |
| A | [#2](https://github.com/agamma233/mpa-wrongbook/pull/2) | IndexedDB唯一权威、事务迁移/导入、HLC、字段合并、笔记版本、v3与紧急备份 | [完整CI](https://github.com/agamma233/mpa-wrongbook/actions/runs/39940912744)、[部署](https://github.com/agamma233/mpa-wrongbook/actions/runs/39943295457) |
| B | [#3](https://github.com/agamma233/mpa-wrongbook/pull/3) | 序号通知+补读、草稿光标保护、持久化outbox与模拟重试 | [完整CI](https://github.com/agamma233/mpa-wrongbook/actions/runs/39945482757) |
| C | [#4](https://github.com/agamma233/mpa-wrongbook/pull/4) | vendor减少81.17%、manifest/图标、完整性预缓存与显式更新 | [完整CI](https://github.com/agamma233/mpa-wrongbook/actions/runs/39945488423)、[A/B/C主分支部署](https://github.com/agamma233/mpa-wrongbook/actions/runs/39945951303) |
| D | [#5](https://github.com/agamma233/mpa-wrongbook/pull/5) | 默认关闭的云适配、SQL、用户隔离、事务RPC、游标与安全测试 | [阶段CI](https://github.com/agamma233/mpa-wrongbook/actions/runs/39945494286)；最终集成以PR最新检查为准，真实项目未联调 |

发布地址：https://agamma233.github.io/mpa-wrongbook/ 。A合并提交1fc2105、B c5082b9、C 88607ad。D与主分支集成包含本地通用补强：普通编辑保留笔记冲突分支、重复导入不制造新提交、禁用localStorage时仍能紧急导出、元数据时钟/归属损坏检查。适配器没有接入生产UI；登录本身也不代表同意上传。

最终本地集成：validate/audit通过；15项Python、13项Node通过；PostgreSQL WASM真实执行SQL角色/grants/RLS与RPC负例通过；Chromium/WebKit全部基础回归、真实同context双标签、事务/配额异常注入、迁移中断、JSON往返、时钟回拨/重开/未来时钟、笔记分支、答题去重、outbox发送期间再改/重复/乱序/丢确认/超时、源站断网重载、PWA版本/资源失败与安全缓存、云SDK模拟均通过。fixture通过。远端CI对最终候选再次执行同样检查。

历史40题、确认答案、16张原卷、legacy和审计依据未修改，已跟踪mobile.png/desktop.png未改写。KaTeX基线2,975,015字节，最终560,052字节（减少81.17%），保留完整20个WOFF2、许可证和必要脚本/CSS。构建生成内容摘要和版本，旧完整缓存保留；所有个人数据均留在IndexedDB，不由SW缓存。

重新核查仍未找到评审HTML、sync-patch/INTEGRATION.md、demo及配套引擎材料，没有声称审查或复用缺失代码。原工作区干净且feat/learning-system分支保留；期间发现的未跟踪同字节vendor副本已原样移出构建树，本机有路径/SHA-256保留清单，未上传。

## 恢复与安全回滚

1. 正常时导出完整v3；v2只作兼容，不能完整恢复冲突/版本/清空历史。独立保存备份，不上传公共仓库。
2. 保存失败先点“紧急导出草稿与原始数据”。紧急文件不是可直接导入的常规备份；其中drafts需要人工检查补写。旧键、迁移原文、操作日志和检查点均保留。
3. 损坏时页面禁止写入，不清空旧数据。先紧急导出，再在干净浏览器/配置文件中导入经校验的v3。不要以空记录覆盖损坏库。
4. 回滚优先停用传输或回退UI，必须保留v3存储适配器、数据库名、旧键、未发送项及备份；禁止部署只读旧localStorage的旧页面。D退出后按用户库和匿名库各自保留，不向新账号迁移旧账号数据。
5. PWA更新不自动刷新；先完成本机事务，失败草稿会阻止激活。静态回退也需重新构建内容摘要，不能删除个人数据库。

## 下一步与未验证边界

按MANUAL-ACCEPTANCE.md分别验收真实iPhone Safari、主屏幕安装、系统冻结/配额/存储回收和MacBook第二设备；这些项目仍未验证。云阶段按STAGE-D.md接入真实测试项目后，另验收GitHub OAuth、anon及两个真实账号REST越权、Realtime断线、多连接提交竞争与双设备。无真实项目和凭据不阻塞A/B/C，也不表示云服务已启用。
