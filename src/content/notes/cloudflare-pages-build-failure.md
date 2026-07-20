---
title: "Cloudflare Pages 构建失败排查：本地路径如何搞砸线上部署"
description: "记录一次 Cloudflare Pages 部署失败的真实排查过程：根因是构建脚本里的 Windows 绝对路径，在 Linux 构建环境不存在时直接退出。"
pubDate: 2026-07-20
tags: ["cloudflare", "CI/CD", "前端", "部署"]
---

# Cloudflare Pages 构建失败排查：本地路径如何搞砸线上部署

这次问题很典型：本地 `npm run build` 完全正常，Push 到 GitHub 后 Cloudflare Pages 却部署失败。排查了二十分钟，发现是**构建脚本里写死了本地 Windows 绝对路径**。

## 一、现象

- 本地提交 `9104293` 已推到 `origin/main`。
- 线上 `wumingmp.me` 还是旧版导航。
- Cloudflare Pages 部署状态显示 `failure`，持续时间只有 12 秒。

## 二、根因

项目里有三个子站点：主站（Astro）和两个 React 实验项目（kaoyan、triworld）。构建脚本 `scripts/build-kaoyan.js` 里写了：

```js
const KAOYAN_APP = resolve('E:/idea/kaoyan-app/app');
```

Cloudflare Pages 的构建环境是 Linux，路径 `/opt/buildhome/repo/E:/idea/kaoyan-app/app` 显然不存在，脚本直接：

```js
process.exit(1);
```

于是整个 `npm run build` 在第一步就挂了。

## 三、修复

把两个构建脚本改成「找不到就跳过」：

```js
const KAOYAN_APP = resolve(process.env.KAOYAN_APP_PATH || 'E:/idea/kaoyan-app/app');

if (!existsSync(KAOYAN_APP)) {
  console.warn(`kaoyan app not found at ${KAOYAN_APP}; skipping`);
  process.exit(0);
}
```

同时加了环境变量覆盖，方便以后在 CI 里指定其他路径。

## 四、验证

1. 本地运行 `npm run build`，通过。
2. 运行死链检查脚本 `python scripts/check_dead_links.py dist`，无死链。
3. 推送新提交 `daa4cf9`。
4. Cloudflare Pages 重新部署成功，`wumingmp.me` 导航更新为商业化新版。

## 五、教训

1. **不要把本地绝对路径写进仓库**。可以用环境变量、相对路径或 `.env` 文件。
2. **CI 和本地环境要一致**。本地能跑不代表线上能跑。
3. **构建脚本要有容错**。可选依赖不存在时，应该跳过而不是直接退出。
4. **提交前看构建日志**。Cloudflare Pages 的日志很详细，12 秒失败通常说明是配置或脚本问题，而不是构建超时。

## 六、附：如何看 Cloudflare Pages 部署日志

1. 打开 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 进入 **Workers & Pages** → 你的 Pages 项目
3. 点击失败的部署 → **Details**
4. 查看 **Build log**，定位 `Failed:` 行

如果你是第一次遇到类似问题，优先看日志里的错误信息，而不是猜是依赖版本或文件大小问题。
