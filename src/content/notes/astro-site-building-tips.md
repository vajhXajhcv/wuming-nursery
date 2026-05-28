---
title: "Astro 建站选型与那些踩过的坑"
description: "为什么选择 Astro 而不是 Hugo 或 Next.js？记录建站过程中的技术选型和真实踩坑经历。"
pubDate: 2026-05-28
tags: ["Astro", "建站", "前端"]
---

# Astro 建站选型与那些踩过的坑

## 为什么选 Astro

在决定搭建这个网站时，我对比了市面上主流的几个静态站生成器：

| 框架 | 优点 | 缺点 | 适合场景 |
|------|------|------|---------|
| **Astro** | 零 JS 默认、构建快、 island 架构 | 生态比 Next.js 小 | 内容站、博客、文档 |
| **Hugo** | 极快（Go 编译）、主题多 | Go 模板语法反人类 | 纯博客、文档 |
| **Next.js** | React 生态、功能全 | 构建慢、JS  bundle 大 | 应用型站点 |
| **Gatsby** | GraphQL 数据层、插件多 | 构建极慢、过时趋势 | 不推荐新项目 |
| **Hexo** | 中文生态好、主题多 | 技术栈老旧 | 中文博客 |

最终选 Astro 的原因是：

1. **内容优先**：我的站主要是文章和项目展示，不需要太多交互
2. **构建速度**：比 Gatsby 快一个数量级
3. ** Island 架构**：页面默认无 JS，只有交互组件才加载 JS
4. **Markdown 原生支持**：写博客最舒服的体验
5. **TypeScript 友好**：类型安全，IDE 提示友好

## 坑 1：Cloudflare Pages 部署 404

这是最容易踩的坑。Astro 默认构建输出到 `dist/` 目录，但 Cloudflare Pages 的默认输出目录是 `/`。

**症状**：部署成功，但访问任何页面都返回 404。

**解决**：在 Pages 项目的 Build settings 里，把 **Build output directory** 设为 `dist`。

```
Framework preset: Astro
Build command: npm run build
Build output directory: dist   ← 关键！
```

## 坑 2：CSS 变量在 dark mode 下的 FOUC

FOUC（Flash of Unstyled Content）是指页面先以亮色样式渲染，然后瞬间切换到暗色。

**原因**：CSS 变量通过 `data-theme` 属性切换，但 JavaScript 设置这个属性需要时间。

**解决**：在 `<head>` 最顶部加一个内联 script，在页面渲染前就设置主题：

```html
<script is:inline>
  (function() {
    const saved = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const theme = saved || (prefersDark ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', theme);
  })();
</script>
```

注意 `is:inline` 属性，确保 Astro 不会把这个 script 打包到 JS bundle 里——它必须在 HTML 里内联执行。

## 坑 3：中文字体加载慢

默认字体栈在 Windows 上回退到「微软雅黑」，但加载体验不够优雅。

**优化方案**：使用系统字体栈，不加载外部字体文件：

```css
body {
  font-family:
    "PingFang SC",           /* macOS/iOS */
    "Hiragino Sans GB",      /* macOS 旧版 */
    "Microsoft YaHei",       /* Windows */
    "Noto Sans SC",          /* Android/Linux */
    sans-serif;
}
```

这套字体栈覆盖所有主流平台，无需下载任何字体文件，首屏渲染极快。

## 坑 4：代码高亮主题切换

Astro 内置 Shiki 代码高亮，但默认只支持单主题。想要 dark mode 下自动切换代码主题：

```js
// astro.config.mjs
export default defineConfig({
  markdown: {
    shikiConfig: {
      themes: {
        light: 'github-light',
        dark: 'github-dark',
      },
      wrap: true,
    },
  },
});
```

Astro 会自动生成两套高亮 CSS，通过 `data-theme` 属性切换。但注意：这会生成两份 CSS，构建体积会稍微增大。

## 坑 5：图片处理与构建时间

Astro 的 `<Image />` 组件会自动优化图片，但如果图片太多或太大，构建时间会爆炸。

**优化建议**：
- 文章配图控制在 200KB 以内
- 使用 `width` 和 `height` 属性避免布局偏移
- 大图用 `loading="lazy"`

```astro
<Image 
  width={1020} 
  height={510} 
  src={heroImage} 
  alt="" 
  loading="lazy"
/>
```

## 坑 6：Client Script 的执行时机

Astro 组件默认只在服务端运行。要在客户端执行 JavaScript，需要：

1. 使用 `<script>` 标签（Astro 会自动提取到 JS bundle）
2. 或者使用 `client:*` 指令的框架组件（React/Vue/Svelte）

对于简单的交互（比如主题切换、搜索过滤），直接用 `<script is:inline>` 最方便。对于复杂的组件（比如评论系统），用 `client:load` 加载 React/Vue 组件。

## 坑 7：内容集合的类型生成

Astro 的内容集合（Content Collections）会自动生成类型，但有时类型不会自动更新。

**解决**：修改 schema 后，手动运行一次构建：

```bash
npm run build
```

或者重启 dev server：

```bash
npm run dev
```

如果类型仍然不对，删除 `.astro/` 目录强制重新生成：

```bash
rm -rf .astro/
npm run dev
```

## 有用的 Astro 技巧

### 1. 条件渲染组件

```astro
{heroImage && <Image src={heroImage} alt="" />}
```

### 2. 传递 slot 内容

```astro
<Layout>
  <h1>标题</h1>
  <p>正文</p>
</Layout>
```

在 Layout 里用 `<slot />` 接收。

### 3. Markdown 中嵌入组件

在 `.mdx` 文件中可以直接使用 Astro 组件：

```mdx
import Callout from '../components/Callout.astro';

<Callout type="tip">
  这是一个提示框组件
</Callout>
```

### 4. 获取所有路由

```astro
---
const posts = await getCollection('blog');
---
```

## 总结

Astro 是我用过的最「省心」的静态站生成器。它不会强迫你用 React，不会生成臃肿的 JS bundle，构建速度快到离谱。

如果你要搭建的是**内容型网站**（博客、文档、个人主页），Astro 几乎是当下最优选。

当然，它也有短板：
- 生态不如 Next.js 丰富（但核心功能都齐了）
- 动态路由需要静态生成（ISR 正在完善中）
- 中文社区资料还不多

但这些对我来说都不是问题——一个内容站不需要太复杂的功能，Astro 的「够用且快」正是我需要的。

---

站点源码：[github.com/vajhXajhcv/wuming-nursery](https://github.com/vajhXajhcv/wuming-nursery)
