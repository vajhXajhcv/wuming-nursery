---
title: "棕色尘埃2 启动器报错「WEB UI加载失败」排查与修复"
description: "桌面快捷方式打不开游戏，启动器报 WEB UI 加载失败。记录从协议注册表、日志到最终重装修复的完整排查过程，附应急绕过方案。"
pubDate: 2026-08-09
tags: ["排坑", "游戏", "Windows"]
---

# 棕色尘埃2 启动器报错「WEB UI加载失败」排查与修复

## 故障现象

双击桌面快捷方式「棕色尘埃2」，弹窗报错：

> 棕色尘埃2Starter启动器运行失败。（WEB UI加载失败）

游戏完全打不开，但报错前程序明明是能正常玩的。

## 排查过程

### 1. 弄清启动链路

桌面快捷方式是一个 `.url` 文件，内容指向自定义协议：

```
URL=browndust2:games/10000002?usn=0
```

注册表 `HKCR\browndust2` 把协议指向 Neowiz 启动器：

```
C:\ProgramData\Neowiz\BrownDust2Starter\BrownDust2Starter.exe
```

启动链路是：**快捷方式 → `browndust2:` 协议 → Neowiz Starter → 游戏本体**。

游戏本体在 `E:\Neowiz\Browndust2\BrownDust2_10000002\`（Unity 引擎），文件完整。`E:\Gamfs_BrownDust II` 只是资源缓存目录（一堆哈希文件夹 + `__info`/`__data` 分块），删了也只会重新下载，不是故障点。

### 2. 排除常见嫌疑

启动器日志目录里有刚才失败时刚写的日志，但内容是加密/混淆过的，读不出有效信息。于是逐项排除：

- **Edge WebView2 运行时**：已安装（151.x），且其他 WebView2 应用正常 → 排除
- **系统代理**：`ProxyEnable = 0`，当前未走代理 → 排除
- **hosts 文件**：干净，无相关劫持 → 排除
- **事件查看器**：无应用程序崩溃记录，说明不是闪退，是启动器主动报错的优雅失败

### 3. 应急方案：绕过启动器

启动器只是个"壳"，游戏本体是独立的 Unity 程序。直接运行：

```
E:\Neowiz\Browndust2\BrownDust2_10000002\BrownDust II.exe
```

游戏正常启动、正常进登录界面。说明**本体完好，问题只在启动器**。

### 4. 修复：重装启动器

用当初下载好的安装包静默重装（Inno Setup 打包，支持静默参数）：

```sh
BD2StarterSetup.exe /VERYSILENT /SUPPRESSMSGBOXES /NORESTART
```

重装后再走协议拉起，启动器 WEB UI 正常加载、完成自更新、自动启动游戏——全链路恢复。

## 结论与经验

- 「WEB UI加载失败」= 启动器自身状态损坏，与网络、代理、WebView2 运行时无关（至少本例如此）。重装启动器即可，游戏数据不受影响。
- 遇到游戏打不开时，先分清**启动器问题**还是**本体问题**：直接运行游戏 exe 是最快的二分定位手段。
- Neowiz 系游戏的本体和启动器是分离的：本体在 `Neowiz\` 目录，缓存分块在 `Gamfs_` 目录，重装启动器两边都不动。
- 安装包别急着删，`E:\BD2StarterSetup.exe` 这次就派上了用场。
