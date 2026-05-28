---
title: "Markdown 写论文工作流：从纯文本到排版正确的 Word"
description: "一套完整的中文学术论文写作工作流，用 Markdown 专注内容，用 docx-formatter-cn 处理格式。"
pubDate: 2026-05-26
tags: ["Markdown", "工具", "工作流"]
---

# Markdown 写论文工作流：从纯文本到排版正确的 Word

## 为什么用 Markdown 写论文

传统写论文的流程是这样的：

1. 打开 Word
2. 调格式调到崩溃
3. 好不容易开始写内容
4. 插入一个公式，格式又乱了
5. 重复步骤 2-4，直到提交 deadline

而用 Markdown：

1. 打开任意文本编辑器（VS Code、Typora、甚至记事本）
2. 专注写内容
3. 最后一步：`docx-formatter-cn` 一键转换
4. 得到一个格式正确的 Word 文档

**核心优势**：内容与格式彻底分离。你负责思考，工具负责排版。

## 我的工作流

### 编辑器选择

| 场景 | 推荐工具 |
|------|---------|
| 快速记录 | VS Code + Markdown 插件 |
| 实时预览 | Typora |
| 协作写作 | VS Code Live Share |
| 移动端 | 任意 Markdown 编辑器 |

我日常用 VS Code，配合 `Markdown All in One` 和 `Markdown Preview Enhanced` 两个插件。前者提供快捷键和目录，后者渲染数学公式。

### 文件组织

```
论文/
├── 01-绪论.md
├── 02-相关工作.md
├── 03-方法.md
├── 04-实验.md
├── 05-结论.md
├── images/
│   ├── fig1.png
│   └── fig2.png
└── references.md
```

每章一个文件，最后用 `cat` 合并：

```bash
cat 01-绪论.md 02-相关工作.md 03-方法.md 04-实验.md 05-结论.md > 论文.md
```

### 封面页元数据

在文件顶部添加 YAML Frontmatter，自动生成封面：

```markdown
---
title: 基于深度学习的图像分类方法研究
author: 张三
student_id: 20240001
advisor: 李四 教授
date: 2026-05-26
abstract: 本文提出了一种改进的卷积神经网络架构...
keywords: [深度学习, 图像分类, 卷积神经网络]
---
```

## 语法速查

### 标题与正文

```markdown
# 一级标题（章）
## 二级标题（节）
### 三级标题（小节）

正文段落，支持**粗体**和*斜体*。
```

### 公式

行内公式：`$E = mc^2$` 或 `\(E = mc^2\)`

块级公式（自动编号）：

```markdown
$$Q_n(x, a) = (1 - \alpha_n) Q_{n-1}(x, a) + \alpha_n [r_n + \gamma V_{n-1}(y_n)]$$
```

### 表格（自动转三线表）

```markdown
| 模型 | 准确率 | 参数量 |
|------|--------|--------|
| ResNet-50 | 92.3% | 25.6M |
| VGG-16 | 90.1% | 138M |
```

### 图片

```markdown
![图1 系统架构](images/arch.png)

![图2 实验结果](images/result.png =400x300)
```

### 引用上标

```markdown
本文提出了改进方案[1][2]。
```

转换后自动变为上标引用格式。

### 参考文献

```markdown
## 参考文献

[1] He K, Zhang X, Ren S, et al. Deep residual learning for image recognition[C]. CVPR, 2016.
[2] Simonyan K, Zisserman A. Very deep convolutional networks for large-scale image recognition[J]. ICLR, 2015.
```

## 转换命令

### 单文件转换

```bash
python -m docx_formatter.cli convert 论文.md -o 论文.docx -t 毕业论文
```

### 批量转换

```bash
python -m docx_formatter.cli batch chapters/ -o output/ -t 课程论文
```

### GUI 方式

```bash
python gui/app.py
```

拖拽文件 → 选择模板 → 点击转换。

## 模板选择指南

| 模板 | 适用场景 | 特点 |
|------|---------|------|
| 课程论文 | 高校课程作业 | 1.5倍行距，A4，2.5cm边距 |
| 毕业论文 | 学位论文 | 章节分页，目录，页眉页脚 |
| 数学建模 | 竞赛论文 | 紧凑排版，单倍行距 |
| 公文 | 政府/企业文件 | 三号字，标准公文格式 |

不确定选哪个？先用「课程论文」，然后根据学校要求微调模板 JSON。

## 常见问题

**Q: 公式显示不对？**
先检查 LaTeX 语法是否正确。常用语法都支持，复杂矩阵建议用 `\begin{matrix}` 环境。

**Q: 图片路径怎么写？**
相对 Markdown 文件的路径。如果图片和 md 文件在同一目录，直接写 `![图1](fig1.png)`。

**Q: 转换后目录不显示？**
Word 需要手动更新域：全选文档（Ctrl+A）→ 右键更新域（F9）。这是 Word 的限制，不是 bug。

**Q: 学校有特殊的格式要求？**
导出预设模板为 JSON，修改后重新加载：

```bash
python -m docx_formatter.cli export-template -t 课程论文 -o custom.json
# 编辑 custom.json
python -m docx_formatter.cli convert 论文.md -o 论文.docx --template-file custom.json
```

## 总结

这套工作流的核心思想是：**把精力花在内容上，而不是和 Word 搏斗**。

Markdown 的纯文本特性意味着：
- 版本控制友好（git diff 可读）
- 跨平台（任何设备都能编辑）
- 专注内容（不会被格式分心）

如果你也在写论文，不妨试试这套流程。
