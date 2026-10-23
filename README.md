# MPA 错题学习台

原题与代码分离；40 道历史题已迁移到 `content/questions`，16 张原图在 `assets/questions`，24 道缺失原卷保持原标记。原始文件完整保存于 `legacy`，禁止擅改历史答案。

## 本地构建

Python 3.11+：

```sh
python3 -m pip install -r requirements.txt
python3 scripts/manage.py validate
python3 scripts/manage.py audit
python3 scripts/manage.py build
python3 -m http.server 8000 --directory dist
```

打开 http://localhost:8000 。仅供个人本地查看完整截图时用 `build --local-images`；此构建产物不得公开发布。公开构建只复制标为已授权的图片，不包含 legacy、原始 Markdown 或个人笔记。

## 数据与备份

题库通过 GitHub 提交和网站构建同步。个人复习数据仅保存在浏览器 localStorage，不实时跨设备同步。用“导出复习记录”备份，再在另一设备“导入复习记录”。导入先全量校验，合并答题历史并去重；冲突笔记均保留，掌握状态优先保留更新时间较新的版本。旧版 `mpa_wrongbook_review_v1` 自动迁移且不删除；旧版导出 JSON 亦可导入。清理浏览器前必须导出。不得向公开仓库上传个人复习记录。

## AI 批量导入

向 Codex 提供 PDF、照片、答案和作答，要求按 AGENTS.md 提取。未知原题不得补造，未知答案留空并标待核实。将完整字段对象数组存为 `imports/batch.json`，运行：

```sh
python3 scripts/manage.py import imports/batch.json
# 逐题审核输出清单，确认后：
python3 scripts/manage.py import imports/batch.json --apply
python3 scripts/manage.py validate
python3 scripts/manage.py audit
```

每个对象包含 id/year/subject/q/title/topic/priority/question_text/options/wrong/correct/brief/explain/lesson/source/confidence/question_status/question_image；图片公开许可字段 image_publication 默认为未授权。ID 例 `2026-数学-01`，题号 q 为数字，年份为字符串，options 是 A—E 对象，缺失时用空对象。导入不改程序代码，重复 ID、题文和缺失字段会阻止导入。经审核后创建 PR，合并须再次确认。

## 初次部署与 CMS

尚未创建远程仓库或发布。推荐先创建私有 `mpa-wrongbook` 保存含原卷的完整审计资料。GitHub Pages 对私有仓库的可用性取决于账户计划；若使用公共仓库，必须先解决 legacy 内嵌截图及独立图片的公开授权，不能仅隐藏网页图片。

Pages 设置选择 GitHub Actions，确认后合并至 main 自动测试构建并部署 dist；PR 仅测试，不发布。Pages CMS 使用 GitHub 登录并授权该仓库；打开“错题管理”录入题目，图片上传后填写许可状态，保存提交触发 Actions。配置完成仍须实测登录、手机新增与编辑，不能以 YAML 存在代替验收。

## 故障处理

构建失败先运行 validate，检查必需字段、选项 A—E、答案字母、重复 ID、图片路径。历史审计失败检查与 legacy 的差异，禁止为让测试通过改正确答案。部署 404 检查 Pages 来源及 Actions，入口和所有资源使用相对路径。记录导入失败时保留原文件，检查 version/review 格式；不要清空浏览器或覆盖原记录。

## 当前验收状态

已完成历史迁移和逐字段、图片字节核对。交互、CMS 实际登录、LaTeX、测试、远程提交与部署仍待验证或完善，未声称已经上线。
