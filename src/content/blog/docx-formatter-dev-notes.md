---
title: "docx-formatter-cn 开发札记：从需求到 Python 工具"
description: "记录一个中文 Word 排版工具的诞生过程——公式引擎、模板系统和 GUI 的选择与取舍。"
pubDate: 2026-05-25
heroImage: ../../assets/blog-covers/docx-formatter-dev-notes.png
tags: ["Python", "开源", "docx-formatter-cn"]
---

# docx-formatter-cn 开发札记：从需求到 Python 工具

> 写论文时最痛苦的不是内容，而是格式。

这句话大概是每个中国学生的心声。我在帮朋友改毕业论文格式时，深深体会到了这一点——页边距、行距、字体、公式编号、三线表、目录域……Word 就像一个永远无法驯服的野兽。

于是我开始思考：能不能写个工具，让 Markdown 直接变成格式正确的 Word 文档？

## 一、为什么不用现有方案

市面上其实有不少类似工具，但都有各自的痛点：

| 工具 | 痛点 |
|------|------|
| Pandoc | 公式转图片，无法编辑；中文字体支持弱 |
| Typora 导出 | 公式转图片；无学术模板 |
| Lark-Formatter | 飞书生态，无法独立使用 |
| docx-skill-4-cn-paper | Node.js 依赖，公式引擎需要子进程 |

我需要的是：**纯 Python、可编辑公式、中文学术模板、开箱即用**。

## 二、技术架构选择

### 2.1 公式引擎：最难啃的骨头

LaTeX 公式转 Word 原生公式（OMML）是核心难点。调研后发现两条路：

**方案 A**：调用 MathType 或 Node.js 子进程做转换
- 优点：兼容性好
- 缺点：需要额外安装，跨平台麻烦

**方案 B**：纯 Python 实现 MathML → OMML
- 优点：零依赖，跨平台稳定
- 缺点：需要自己实现映射

最终选了方案 B。实现路径：

```
LaTeX 字符串
  ↓  latex2mathml
MathML XML
  ↓  自研 mathml_to_omml.py
Word OMML XML
  ↓  python-docx lxml
.docx 中的可编辑公式
```

`mathml_to_omml.py` 的核心是一个递归下降解析器，把 MathML 的 `<mfrac>`、`<msqrt>`、`<munderover>` 等标签映射到 OMML 的 `<m:f>`、`<m:rad>`、`<m:lim>`。目前已支持分数、根式、求和、积分、矩阵、分段函数等常用语法。

### 2.2 Markdown 解析与 docx 构建

基于 `python-docx` 和 `markdown-it-py`（后来换成了更轻量的 `mistune`）：

```python
md_text → AST 节点树 → docx 段落/表格/图片
```

关键设计：
- **Pipeline 引擎**：每个节点类型对应一个 renderer，可插拔
- **模板系统**：YAML/JSON 预设，覆盖页面、字体、段落、页眉页脚
- **三线表**：拦截 Markdown 表格，自定义边框样式

### 2.3 GUI：PySide6 还是 Tkinter？

Tkinter 是标准库，但界面太丑。PySide6 需要额外安装，但界面现代、支持拖拽。最终选了 PySide6，毕竟目标用户是写论文的学生，界面丑了没人想用。

GUI 设计很克制：左边模板选择，中间文件列表，底部进度条。支持**生成模式**（Markdown → Word）和**修正模式**（已有 Word → 应用模板样式）。

## 三、开发过程中的坑

### 坑 1：Word 目录域不会自动更新

`python-docx` 可以插入 TOC 域，但打开文档后不会自动刷新，需要用户手动右键更新。 workaround 是用 VBA 宏，但宏需要用户手动启用，体验不好。

最终方案：在文档末尾加一段提示文字，引导用户按 `Ctrl+A` → `F9` 更新域。不够优雅，但可靠。

### 坑 2：中文字体在跨平台时的差异

Windows 有「宋体」「黑体」，macOS 叫「Songti SC」「Heiti SC」，Linux 可能没有。最终采用了字体回退策略：

```python
font.name = 'Times New Roman'
font._element.rPr.rFonts.set(qn('w:eastAsia'), '宋体')
```

并在文档中附带字体安装说明。

### 坑 3：LaTeX 语法边角的兼容性

`latex2mathml` 对复杂语法支持有限，比如 `\begin{cases}` 嵌套 `\frac`。解决方案是在 mathml 层做预处理，把不标准的 MathML 修正为标准形式再转 OMML。

## 四、开源发布

项目最终定名 `docx-formatter-cn`，MIT 协议开源。

发布前做了几件事：
1. **单元测试**：用 `pytest` 覆盖核心转换逻辑
2. **CI**：GitHub Actions 跑测试 + 代码风格检查
3. **文档**：README + 文档站（就是你现在看到的 `/projects/docx-formatter-docs/`）
4. **Skill 封装**：Node.js wrapper，让 AI Agent 可以直接调用

## 五、后续计划

- [ ] 更多 Pipeline 规则（标题识别、图表题注修正）
- [ ] 自定义模板热加载
- [ ] 图片自动压缩和裁剪
- [ ] 批量目录转换

## 六、写在最后

这个项目从一个「帮朋友改格式」的临时脚本，慢慢长成了一个完整的工具。过程中最开心的时刻，是朋友说「用这个转出来的论文，导师说格式没问题」的那一刻。

如果你也在为 Word 排版头疼，欢迎试试 [docx-formatter-cn](/projects/docx-formatter-cn/)。

---

项目地址：[github.com/vajhXajhcv/docx-formatter-cn](https://github.com/vajhXajhcv/docx-formatter-cn)
