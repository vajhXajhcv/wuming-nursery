---
title: "AI 给我的网站做了一次安全体检：从检测到修复的全记录"
description: "让 AI 对挂在 Cloudflare Pages 上的个人站点做了一次完整的安全审计：响应头、TLS 配置、DNS 防伪造、CNAME 跳转，逐项检测、逐项修复、逐项验证。"
pubDate: 2026-08-28
heroImage: ../../assets/blog-covers/ai-security-audit-hardening.png
tags: ["安全", "Cloudflare", "AI 工作流", "网站"]
---

# AI 给我的网站做了一次安全体检：从检测到修复的全记录

最近在折腾 AI 辅助工作流时冒出一个想法：与其让 AI 帮我写代码，不如让它换个角色——**给我的网站做一次安全审计**。这个站是 Astro 静态博客 + Cloudflare Pages 托管，还有几个 Pages Functions 写的支付接口，正好是个不错的练手对象。

整个过程比想象中顺利：AI 负责检测、定位、修复、验证，我负责确认每一步操作。这篇文章完整记录查出了什么、怎么修的、以及踩到的一个有趣的坑。

## 一、检测：先看暴露面

第一步是被动检测，不发任何攻击性请求，只看公开信息：

- 响应头里有什么、缺什么
- 常见敏感路径（`/.git/HEAD`、`/.env`、`/admin` 等）是否泄露
- DNS 记录（A、MX、TXT）
- TLS 配置

好消息是底子不差：源站 IP 藏在 Cloudflare 后面，已有 `X-Frame-Options` 等基础头，没有敏感文件泄露。

坏消息是查出了 7 个问题。

## 二、查出的问题

**1. 缺少 HSTS。** 没有 `Strict-Transport-Security` 头，用户首次走 HTTP 访问时仍有被劫持的窗口。

**2. www 子域完全无法访问。** 很多用户习惯输 `www.xxx.com`，我的 DNS 里压根没这条记录，直接超时。

**3. `Access-Control-Allow-Origin: *` 出现在所有响应上。** 这条查起来最有意思——它不在我的代码里，不在 `_headers` 里，不在 Cloudflare 后台的 Transform Rules / Snippets / Workers 里。AI 一层层排除：先查仓库里的 `_headers`，再查构建产物 `dist/_headers`，再查 git 历史，再通过 Cloudflare API 查 zone 级的规则和托管头，最后对比 `pages.dev` 域名和自定义域名的响应，确认这是 **Pages 平台层默认加的头**。修复方式是在 `_headers` 里用 `! Access-Control-Allow-Origin` 语法显式剥离。

**4. 缺少 CSP 和 Permissions-Policy。** XSS 一旦发生没有最后一道防线。

**5. 域名没有 SPF/DMARC 记录。** 因为我不用这个域名发邮件，DNS 里什么邮箱记录都没配——这意味着**任何人都可以伪造 `@wumingmp.me` 的发件人**发钓鱼邮件。这是很多人会忽略的一点：不发邮件 ≠ 不用配防伪造。

**6. HTML 里带着 `<meta name="generator" content="Astro v6.2.2">`。** 精确版本号等于告诉攻击者去查哪个版本的已知漏洞。

**7. 顺手又查出两个平台配置问题**：TLS 最低版本还是 1.0（早已被淘汰），SSL 模式是 Full 而非 Full (strict)（回源不校验证书合法性）。

## 三、修复：代码层 + 平台层

**代码层**改了三个文件：

- `public/_headers`：补上 HSTS、CSP、Permissions-Policy，剥离 ACAO 通配符。CSP 按实际情况收紧——唯一需要放行的第三方是 giscus 评论（`script-src` 和 `frame-src` 白名单），表单只放行 formspree 和 buttondown 两个外部提交地址
- `src/components/BaseHead.astro`：删掉 generator 标签
- `public/.well-known/security.txt`：新增安全联系渠道，方便别人报告漏洞

**平台层**通过 Cloudflare API 直接改：

- DNS 加了 `www` CNAME（走代理）+ SPF（`v=spf1 -all`）+ DMARC（`p=reject`）三条记录
- 加了一条 301 重定向规则：www → 主域，路径和查询参数保留
- TLS 最低版本提到 1.2，SSL 模式改成 Full (strict)，开启 Always Use HTTPS

## 四、验证：每一项都拿到证据

修复不是改完就算完，每一项都重新验证：

- 响应头里 HSTS / CSP / Permissions-Policy 齐全，ACAO 消失
- 全站不再有 generator 标签
- `https://www.wumingmp.me/some/page?a=1` 正确 301 到主域且参数保留
- 用 TLS 1.0 发起连接被拒绝，1.2/1.3 正常
- 首页、博客、评论区回归测试全部 200

## 五、几点感想

**AI 在安全测试里的正确定位**：它不是自动黑客工具，而是一个"不知疲倦的审计员"。它最强的环节是系统性地逐项排查（人最容易漏掉"我以为我配了"的项）、一层层定位问题来源（比如那个 ACAO 头的排除过程）、以及改完立刻回归验证。

**个人站的安全基线其实很便宜**：这次修的所有东西——安全头、DNS 记录、TLS 配置——全是免费的，总耗时不到一小时，但把站点从"裸奔的大多数人"提升到了前几个百分点。

**不发邮件的域名也要配 SPF/DMARC**，这是这次我自己收获最大的一条。

如果你也挂着 Cloudflare，可以照这个清单自查一遍：HSTS 开了吗？CSP 有吗？TLS 最低版本是 1.2 吗？SSL 是 strict 吗？www 能访问吗？SPF/DMARC 配了吗？`curl -sI https://你的域名` 一分钟就能看出大半答案。
