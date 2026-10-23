# A：本地事务与恢复验收（2026-10-23）

基线 origin/main 63bd046。原工作区 feat/learning-system dd930fd 干净，保留该分支。main/feat 分支及 Documents、Downloads、Desktop 未找到 mpa-wrongbook-评审与实时同步方案.html、sync-patch/INTEGRATION.md、demo、同步引擎或 Supabase 适配，因此未审查或复用这些缺失材料。

新增 model.js 和 store.js；原生 IndexedDB 的 meta/records/operations/outbox/migrations/checkpoints 同事务提交。持久化 HLC；字段 LWW，掌握计划成组；笔记 DAG 保留分支，空文本是有版本的清空，祖先不回收；事件集合冲突拒绝。v3 导入不恢复身份和发送状态，全部新操作重新进入匿名本地 outbox。旧键不删，迁移原文和导入前检查点可从完整备份取得。紧急导出包含尚未提交的草稿，不是可直接导入的常规备份。

测试：13 项 Python、12 项 Node 通过；Chromium 浏览器回归通过；真实 IDB 测试包括同 context 双页面并发、同/不同字段、笔记分支、刷新关闭、事务中止、注入 QuotaExceededError、导入碰撞与检查点原子性、迁移中断重试和双连接仅迁移一次、损坏恢复、v3 往返、v2 限制。物理磁盘耗尽未模拟，注入异常不等于真实设备配额测试。WebKit 结果在最终阶段报告补充。

回滚：优先关闭传输（本阶段无网络传输）或恢复旧 UI 布局，但必须保留 v3 store/model 适配器及数据库名。不得部署只读旧 localStorage 的旧 app.js。保留旧键、IndexedDB、outbox 和备份；修复损坏前先紧急导出，不提供一键清库。完整 v3 可在干净浏览器中导入恢复；紧急导出中的 drafts 需人工检查后补写。

未验证：真实 iPhone Safari、主屏幕、MacBook 双设备、真实磁盘配额。B 的页面通知/补漏与传输模拟、C 的完整离线安装将在独立 PR 验收。
