# 个人展示网站

这是一个可直接发布到 GitHub Pages 的静态个人主页，用于展示简历、个人经历、作品集和联系方式。

## 需要替换的内容

1. 打开 `index.html`，把所有“你的姓名”“岗位”“项目”“邮箱”“链接”等占位内容替换成真实信息。
2. 将你的简历 PDF 命名为 `resume.pdf`，放在本文件夹根目录。
3. 如果要替换首屏背景图，把新图片放到 `assets/`，再修改 `styles.css` 里的 `assets/hero-workspace.png`。

## 发布到 GitHub Pages

1. 在 GitHub 创建一个新仓库，例如 `yourname.github.io`。
2. 把本文件夹里的全部文件上传到仓库。
3. 进入仓库 `Settings` → `Pages`。
4. Source 选择 `Deploy from a branch`。
5. Branch 选择 `main` 和 `/root`，保存。
6. 等待 GitHub Pages 构建完成后访问发布链接。

## 文件说明

- `index.html`：网页内容
- `styles.css`：页面样式
- `script.js`：年份等轻量脚本
- `assets/hero-workspace.png`：首屏背景图
