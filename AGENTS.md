# 错题维护规则
先读 README.md。题库在 content/questions，每题 Markdown + YAML Frontmatter；不得更改旧题答案或补造缺失内容。
从用户资料提取错题，保持原文、选项、作答、答案和出处。不确定答案留空，question_status 标待核实；不得猜测。扫描原件保留，未知公开授权 image_publication 必须为未授权。
ID 为 年份-科目-两位题号。先运行 python3 scripts/manage.py import imports/batch.json（默认只预览）；输出新增 ID、来源、不确定字段供用户审核。确认后加 --apply 写入，运行验证和测试，再创建 PR。合并、公开发布需用户确认。
不得上传个人复习笔记、凭据或未授权原卷到公共仓库。legacy 原件含截图，提交前必须确认仓库可见性，默认使用私有仓库。
