# MPA 错题学习台

静态网站 + Markdown/YAML 题库 + Pages CMS；无自建数据库。原有40题（数学17、逻辑23）、16张原卷和24道缺失标记完整迁移，原始文件保存在 legacy，正确答案未改。个人复习记录仅保存在本机，可通过 JSON 导出、导入跨设备恢复，不提供实时同步。

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

题库通过 GitHub 提交和网站构建更新。个人记录使用 localStorage，随浏览器和设备隔离。

- 先“导出复习记录”，再在另一设备“导入复习记录”。导入会先校验全文件，再合并历史答题并按记录ID去重。
- 笔记冲突保留两份内容；掌握状态按较新的更新时间合并。重复导入不会重复添加相同笔记或答题记录；格式错误时原有记录不变。
- 旧版 mpa_wrongbook_review_v1 自动迁移且保留原键；旧版导出 JSON 也可导入。
- 清理浏览器、使用无痕模式或换设备前请导出。题库备份需包含 content、assets、legacy，个人复习JSON另存，不上传仓库。
- 间隔复习：未掌握1天、复习中3天、已掌握7天，状态变更后重新安排。先联网访问一次可离线重载；图片和字体访问后缓存。

## 测试

```sh
python3 -m unittest discover -s tests
npm install --ignore-scripts
npm test
npx playwright install chromium
python3 scripts/manage.py build
npm run test:browser
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
