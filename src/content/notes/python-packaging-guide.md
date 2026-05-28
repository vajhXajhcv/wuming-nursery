---
title: "Python 项目从 0 到 PyPI：打包、发布与 CI 实践"
description: "一份面向实用主义者的 Python 项目打包指南，涵盖 pyproject.toml、GitHub Actions 和版本管理。"
pubDate: 2026-05-27
tags: ["Python", "CI/CD", "开源"]
---

# Python 项目从 0 到 PyPI：打包、发布与 CI 实践

## 项目结构

一个现代 Python 项目应该长这样：

```
my-project/
├── src/
│   └── my_package/
│       ├── __init__.py
│       └── core.py
├── tests/
│   └── test_core.py
├── .github/
│   └── workflows/
│       └── ci.yml
├── pyproject.toml
├── README.md
├── LICENSE
└── .gitignore
```

注意 `src/` 布局——把源码放在 `src/` 目录下，可以避免运行时导入本地代码（而不是安装后的包），减少很多奇怪的问题。

## pyproject.toml 配置

`setup.py` 已经过时了。现代 Python 项目用 `pyproject.toml`，它同时被 `pip`、`build`、`twine` 支持。

```toml
[build-system]
requires = ["setuptools>=61.0", "wheel"]
build-backend = "setuptools.build_meta"

[project]
name = "my-package"
version = "0.1.0"
description = "A short description"
readme = "README.md"
license = {text = "MIT"}
requires-python = ">=3.10"
authors = [
    {name = "Your Name", email = "you@example.com"}
]
keywords = ["python", "tool"]
classifiers = [
    "Development Status :: 3 - Alpha",
    "Intended Audience :: Developers",
    "License :: OSI Approved :: MIT License",
    "Programming Language :: Python :: 3",
    "Programming Language :: Python :: 3.10",
    "Programming Language :: Python :: 3.11",
    "Programming Language :: Python :: 3.12",
]

dependencies = [
    "requests>=2.28",
    "pydantic>=2.0",
]

[project.optional-dependencies]
dev = [
    "pytest>=7.0",
    "pytest-cov",
    "black",
    "ruff",
    "mypy",
]

[project.scripts]
my-cli = "my_package.cli:main"

[project.urls]
Homepage = "https://github.com/username/my-package"
Repository = "https://github.com/username/my-package"
Issues = "https://github.com/username/my-package/issues"

[tool.setuptools.packages.find]
where = ["src"]

[tool.black]
line-length = 100
target-version = ['py310']

[tool.ruff]
line-length = 100
select = ["E", "F", "I", "N", "W"]

[tool.pytest.ini_options]
testpaths = ["tests"]
addopts = "--cov=my_package --cov-report=term-missing"
```

一个文件搞定：构建、依赖、脚本入口、代码风格、测试配置。

## 本地开发流程

### 1. 创建虚拟环境

```bash
python -m venv .venv
source .venv/bin/activate  # Linux/macOS
# .venv\Scripts\activate   # Windows
```

### 2. 可编辑安装

```bash
pip install -e ".[dev]"
```

`-e` 表示 editable mode，修改源码后无需重新安装即可生效。`[dev]` 安装开发依赖。

### 3. 代码风格

```bash
black src/ tests/
ruff check src/ tests/
ruff format src/ tests/
```

### 4. 运行测试

```bash
pytest
```

## GitHub Actions CI

`.github/workflows/ci.yml`：

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        python-version: ['3.10', '3.11', '3.12']

    steps:
      - uses: actions/checkout@v4

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: ${{ matrix.python-version }}

      - name: Install dependencies
        run: |
          python -m pip install --upgrade pip
          pip install -e ".[dev]"

      - name: Lint with ruff
        run: ruff check src/ tests/

      - name: Format check with black
        run: black --check src/ tests/

      - name: Test with pytest
        run: pytest --cov=my_package --cov-report=xml

      - name: Upload coverage
        uses: codecov/codecov-action@v4
        with:
          files: ./coverage.xml
```

这套 CI 做了四件事：
1. 多版本 Python 测试（3.10/3.11/3.12）
2. 代码风格检查（ruff + black）
3. 单元测试 + 覆盖率
4. 覆盖率上传到 Codecov

## 发布到 PyPI

### 手动发布

```bash
# 1. 构建
python -m build

# 2. 上传到 PyPI
python -m twine upload dist/*
```

### 自动发布（推荐）

在 CI 中加入发布步骤，打 tag 时自动发布：

```yaml
  release:
    needs: test
    runs-on: ubuntu-latest
    if: startsWith(github.ref, 'refs/tags/v')

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.12'
      - run: pip install build twine
      - run: python -m build
      - run: python -m twine upload dist/*
        env:
          TWINE_USERNAME: __token__
          TWINE_PASSWORD: ${{ secrets.PYPI_API_TOKEN }}
```

使用方式：

```bash
git tag v0.1.0
git push origin v0.1.0
```

CI 自动测试、构建、发布。

## 版本管理

推荐用 [semantic-release](https://semantic-release.gitbook.io/) 或手动遵循 [SemVer](https://semver.org/lang/zh-CN/)：

- `MAJOR`：不兼容的 API 变更（如 `1.0.0` → `2.0.0`）
- `MINOR`：向后兼容的功能添加（如 `1.0.0` → `1.1.0`）
- `PATCH`：向后兼容的问题修复（如 `1.0.0` → `1.0.1`）

## 实用小技巧

**查看包内容**：
```bash
python -m build
unzip -l dist/*.whl
```

**本地测试安装包**：
```bash
pip install dist/*.whl
```

**检查元数据**：
```bash
pip show my-package
```

**清理构建产物**：
```bash
rm -rf build/ dist/ *.egg-info/
```

## 总结

| 步骤 | 命令/文件 |
|------|----------|
| 初始化项目 | `pyproject.toml` |
| 开发安装 | `pip install -e ".[dev]"` |
| 代码格式化 | `black` + `ruff format` |
| 代码检查 | `ruff check` |
| 运行测试 | `pytest` |
| 构建分发包 | `python -m build` |
| 发布到 PyPI | `twine upload dist/*` |

把这套流程跑通后，你的 Python 项目就有了专业级的工程化基础。
