# MPA 管综错题本 - GitHub Pages 部署版

本包是你原版 HTML 的部署版，题库内容、原题截图与交互功能均保持不变。

## 一、部署

1. 登录 GitHub，新建**独立公共仓库**，例如 `mpa-wrongbook`。
2. 上传仓库根目录中的 `index.html` 和 `.nojekyll`。`README.md` 为说明文件，可一起上传。
3. 进入仓库的 **Settings → Pages**，在 **Build and deployment** 中设置：
   - Source: `Deploy from a branch`
   - Branch: `main`
   - Folder: `/(root)`
   - 点击 **Save**。
4. 发布完成后，通过 `https://你的GitHub用户名.github.io/mpa-wrongbook/` 访问。

## 二、当前题库

- 共 40 道错题。
- 16 道附带原卷题干/选项截图。
- 24 道尚需补齐原卷。
- 题目和图片（16 张）已内嵌在 HTML 中，不依赖外部图片地址。
- 当前版本可以搜索、筛选、查看解析、记录二刷状态与错因、导出复习 JSON。

## 三、重要限制

- **不同设备无法自动同步。** 二刷记录只保存在各设备各浏览器的 `localStorage` 中。换设备、清理浏览器数据或使用无痕模式时不能依赖其保留。
- **支持导出，但没有导入功能。** 导出的 JSON 只能作为备份文件，当前网页不能直接将其导入恢复。
- **题库更新需要提交新的 `index.html`。** GitHub Pages 本身是静态站点，用户在网页上填写的错因不会回写 GitHub 仓库。
- **公开可见。** GitHub Pages 站点通常对互联网公开，因此发布前请自行核对题目截图的公开传播权及题库是否包含不愿公开的信息。
- 如果日后希望跨设备同步，须新增同步功能或更换具备账号及数据库的平台。

官方文档：https://docs.github.com/zh/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site
