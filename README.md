# 无名苗圃

独立开发者 · 技术创作者 · 一人公司探索者。

基于 [Astro](https://astro.build) 构建，部署在 Cloudflare Pages。

## 技术栈

- **框架**: Astro 6.x
- **语言**: TypeScript
- **样式**: CSS
- **部署**: Cloudflare Pages
- **域名**: wumingmp.me

## 本地开发

```sh
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建生产版本
npm run build

# 预览构建结果
npm run preview
```

## 项目结构

```
├── public/          # 静态资源
├── src/
│   ├── assets/      # 图片、字体等
│   ├── components/  # 可复用组件
│   ├── content/     # 博客文章与笔记 (Markdown)
│   ├── layouts/     # 页面布局
│   ├── pages/       # 路由页面
│   └── styles/      # 全局样式
└── astro.config.mjs
```

## 添加文章

在 `src/content/blog/` 目录下新建 `.md` 文件：

```markdown
---
title: "文章标题"
description: "文章简介"
pubDate: 2026-05-13
---

正文内容...
```

提交并推送后，Cloudflare Pages 会自动构建部署。
