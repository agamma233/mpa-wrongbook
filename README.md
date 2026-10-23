# MPA 错题学习台

静态网站 + Markdown/YAML 题库 + Pages CMS；无自建数据库。原有40题（数学17、逻辑23）、16张原卷和24道缺失标记完整迁移，原始文件保存在 legacy，正确答案未改。个人复习记录以 IndexedDB 事务保存在本机，可用完整 v3 JSON 备份恢复；默认无云服务。支持移动布局和完整公式离线缓存。

## 初次部署

仓库：https://github.com/agamma233/mpa-wrongbook ，审核 PR：https://github.com/agamma233/mpa-wrongbook/pull/1 。

当前账户的 GitHub Pages 要求公开仓库才能免费使用。16张历史原卷截图的公开传播授权已由用户确认；公开仓库、合并和发布仍须用户最终确认。公开仓库将同时公开题库、legacy原件、原卷图片及提交历史；个人 localStorage 笔记不会上传。

确认后：将仓库设为 public，在 Settings → Pages → Build and deployment 中选择 GitHub Actions，再合并已通过检查的 PR。main 每次提交会验证、测试、构建并部署 dist；PR 只测试不部署。预期地址为 https://agamma233.github.io/mpa-wrongbook/ ，须部署完成并在线验收后才能认定上线。

## 本地开发和复习

需要 Python 3.11+；浏览器测试另需 Node.js 22+。

```sh
python3 -m pip install -r requirements.txt
python3 scripts/manage.py validate
python3 scripts/manage.py audit
python3 scripts/manage.py build
python3 -m http.server 8000 --directory dist
```

打开 http://localhost:8000 。公开构建仅包含标为“已授权”的图片，不包含 legacy 或原始 Markdown。新上传素材默认未授权。仅供个人本地查看未授权图片时可用 `build --local-images`，不得公开上传该产物。

## 手机日常录题：Pages CMS

访问 https://app.pagescms.org ，用 GitHub 登录，选择 mpa-wrongbook。当前未合并时配置位于 feat/learning-system 分支；合并后选择 main。

1. 打开“错题管理”→ Add an entry。顶部 Filename 填 `年份-科目-两位题号.md`，例如 `2026-数学-01.md`；“唯一题目ID”填写同名但不含 .md 的值。
2. 年份为文本，科目选择数学/逻辑，题号填数字；填写标题、知识点、优先级和来源。
3. 录入题干与完整 A—E 选项。缺失原题不得猜测；选项不全时全部留空，状态填写“待补原卷”。答案未知留空，状态必须包含“待核实”。
4. 解析、思路摘要、复习要点和本人答案可留空。CMS 省略的可选文本会统一为空字符串；A—E 全空统一为空对象，部分缺失会阻止构建。
5. 用原卷图片字段 Upload 上传，或 Select 选择媒体库图片。确认具有公开传播授权后才能选择“已授权”。
6. Save 自动创建 GitHub 提交；编辑已有题同样 Save。列表或编辑页菜单支持删除，Git提交保留恢复依据。

原始40题的内容受 audit 保护：擅自更改历史字段、正确答案或替换原卷会使构建失败。补充或纠正历史记录时，先向 Codex 提供原卷和明确确认，审核变更后再更新审计依据；不要通过删除 audit 来绕过核查。

CMS 新增、桌面编辑、390像素手机布局编辑、GitHub提交与删除流程已实际验收；测试条目已清理，正式题库仍为40题。

## AI 批量导入：无需改程序

向 Codex 提供 PDF、照片、答案、本人作答或结构化资料，要求遵守 AGENTS.md：只收录确认的错题、保留来源、不猜测题干及答案、先输出清单供审核。将对象数组存为 imports/batch.json：

```json
[{"id":"2026-数学-01","year":"2026","subject":"数学","q":1,"title":"导入演示","topic":"算术","priority":"常规","question_text":"演示：1+1=?","options":{"A":"1","B":"2","C":"3","D":"4","E":"5"},"wrong":"A","correct":"B","brief":"演示","explain":"1+1=2","lesson":"核对运算","source":"导入演示，非历史错题","confidence":"演示","question_status":"已核实","question_image":"","image_publication":"未授权"}]
```

该例只演示格式，不属于历史题库；实际录题时使用用户资料。

```sh
python3 scripts/manage.py import imports/batch.json
# 审核输出的新增ID、标题、来源和状态，用户确认后再写入：
python3 scripts/manage.py import imports/batch.json --apply
python3 scripts/manage.py validate
python3 scripts/manage.py audit
```

图片先放在 assets/questions，question_image 填仓库相对路径。工具检查必需字段、重复ID、重复题文、答案、完整选项和图片存在性。未知答案用空字符串并标待核实，缺失选项用空对象。确认清单后创建PR，合并后自动部署；不要将导入原件、个人笔记或凭据提交到公开仓库。

## 复习记录与备份

题库通过 GitHub 更新；个人记录以 IndexedDB v3 为唯一权威。localStorage 旧键保留原文，不再写入个人记录；首次启动在同一事务内迁移 v1/v2。读取损坏时进入恢复模式，禁止空状态覆盖。

- 页面显示“已保存本机”表示事务已完成；失败时保留当前草稿，点击“紧急导出草稿与原始数据”。清除浏览器前请保存完整 v3 备份。
- 完整 v3 备份包含不可变操作、笔记祖先/冲突、迁移原文、检查点和待发送信息。导入先验证操作，再在事务内按最新状态合并并留检查点；重复导入不重复事件，失败不部分写入。恢复不信任设备身份、账号或已发送标记。
- v2 兼容导出仅包含显示记录，不含笔记分支与清空历史，不适合完整恢复。v1、v2、历史 JSON 均可迁移或导入。
- 不同字段各自合并；掌握状态和下次复习日期成组。笔记并发修改保留独立版本，可“以当前笔记解决冲突”；清空也是新版本，旧版本不回收。答题 ID 相同但内容不同会拒绝整个导入。
- 云服务默认未配置，尚无跨设备实时同步。先导出再到另一设备导入。浏览器清理、系统回收、无痕模式仍可能删除本机数据库，独立备份不可省略。

## 测试

```sh
python3 -m unittest discover -s tests
npm install --ignore-scripts
npm test
npx playwright install chromium webkit
python3 scripts/manage.py build
npm run test:browser
BROWSER_ENGINE=webkit npm run test:browser
node tests/reliability.mjs
BROWSER_ENGINE=webkit node tests/reliability.mjs
python3 scripts/verify_fixture.py
```

内容测试检查历史一致性和未授权图片排除。浏览器测试覆盖仓库子路径、搜索、年份/科目/知识点筛选、随机、收藏、今日任务、统计、作答、答案折叠、公式/XSS、记录导出导入和离线重载；在390/768/1440像素验收，超长公式在题目区域内滚动。隔离测试另建测试题验证新增题展示和16图加载，不污染正式题库。

配置依据：[Pages CMS集合](https://pagescms.org/docs/configuration/content/)、[媒体](https://pagescms.org/docs/configuration/media/)。.pages.yml 和迁移题目使用有效 YAML 的 JSON 表达；CMS 保存的常规 YAML 同样支持。

## 故障处理

构建失败先看 Actions，并在本地运行 validate：检查字段、重复ID、A—E和答案、图片路径、待核实状态。历史 audit 失败需核对 legacy 差异，不得擅改正确答案或绕过验证。

部署404检查 Pages 来源是否为 GitHub Actions、main构建是否成功；入口与资源均为相对路径，兼容仓库子路径。更新后浏览器优先联网获取新资源，离线时使用已缓存版本。

记录导入失败时保留原备份，检查 version/review 结构；不要清空浏览器。若本机保存提示失败，立即导出记录。常见凭据模式扫描仅是辅助，提交前仍需确认没有凭据、个人复习JSON或未授权素材。

## 验收状态

40题与原件字段差异0；16图字节一致，24道缺图未补造。13项Python测试、7项记录单元测试、浏览器交互及云端Actions通过；CMS真实新建/编辑提交也已自动构建通过。尚未合并公开发布，线上地址及最终部署验收未完成。

## 安装到 iPhone 与离线更新

Safari 打开 https://agamma233.github.io/mpa-wrongbook/ ，点分享 → 添加到主屏幕 → 添加。首次联网等待“离线资源已准备完成”。必要脚本、题库、样式、图标和完整公式 WOFF2 均校验成功才安装新版；原卷图片按需缓存，可逐张点击“下载原卷，供离线使用”保存到“文件”。

出现新版提示后，点击“完成本机保存后更新”。有失败草稿时会阻止更新；更新不自动刷新页面、不修改个人数据库，旧完整缓存保留。完成后可以手动刷新。首次未联网安装成功前不能保证离线可用；系统可能清理站点存储，完整 v3 备份请另存。

阶段验收与回滚见 docs/STAGE-A.md、docs/STAGE-B.md、docs/STAGE-C.md。此前“初次部署/验收状态”段落保留首次交付记录，以各阶段报告和 GitHub Actions 当前结果为准。真实 iPhone Safari、主屏幕安装及 MacBook 双设备未验证。
