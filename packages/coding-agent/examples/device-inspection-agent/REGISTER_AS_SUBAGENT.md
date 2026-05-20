# 将 Device Inspection Agent 注册为 pi 子 Agent

在原有独立脚本的基础上，通过 extension + markdown agent definition 方式，让 pi 可以直接调用 inspect agent。

跨平台支持：macOS / Linux / Windows（需要 Git Bash）。

## 原理

```
pi 主 Agent
  → subagent extension（注册 subagent 工具）
    → 读取 ~/.pi/agent/agents/inspect.md（agent 定义）
      → 启动独立 pi 进程，注入巡检提示词和只读工具集
        → 执行 python $DEVICE_INSPECTION_SKILL_DIR/scripts/judge_rules.py --fetch --json
          → 结果返回主 Agent
```

## 操作步骤

### 步骤 0：设置环境变量（跨平台）

在 shell 配置文件中设置 `DEVICE_INSPECTION_SKILL_DIR`：

```bash
# macOS / Linux (~/.zshrc 或 ~/.bashrc)
export DEVICE_INSPECTION_SKILL_DIR=/Users/simon/01.code/skills/device-inspection

# Windows Git Bash (~/.bashrc)
export DEVICE_INSPECTION_SKILL_DIR=/d/code/skills/device-inspection
```

### 步骤 1：安装 subagent extension

**macOS / Linux：**

```bash
cd /path/to/pi
mkdir -p .pi/extensions
ln -s /path/to/pi/packages/coding-agent/examples/extensions/subagent \
      .pi/extensions/subagent
```

**Windows（无 symlink 权限时用复制）：**

```powershell
cd D:\code\pi
mkdir .pi\extensions -Force
xcopy packages\coding-agent\examples\extensions\subagent .pi\extensions\subagent\ /E
```

pi 启动时会按以下顺序发现 extensions：
1. `.pi/extensions/`（项目级）
2. `~/.pi/agent/extensions/`（用户级）

subagent 是目录形式的 extension，包含 `index.ts` 入口文件，会被自动识别。

### 步骤 2：创建 agent 定义文件

```bash
# 所有平台通用
mkdir -p ~/.pi/agent/agents
```

文件格式为 markdown + YAML frontmatter。关键：提示词中使用 `$DEVICE_INSPECTION_SKILL_DIR` 环境变量而非硬编码路径，用 `python` 而非 `python3`：

```markdown
---
name: inspect
description: 楼宇自控（BAS/HVAC）设备巡检专家
tools: bash, read, grep, find, ls
---

你是一个楼宇自控（BAS/HVAC）设备巡检专家 Agent。

## 环境要求
运行巡检前，确保已设置环境变量 DEVICE_INSPECTION_SKILL_DIR...

## 巡检命令
python $DEVICE_INSPECTION_SKILL_DIR/scripts/judge_rules.py --fetch --json
```

完整的 agent 定义见 `~/.pi/agent/agents/inspect.md`。

**YAML frontmatter 字段说明**：

| 字段 | 必填 | 说明 |
|------|------|------|
| `name` | 是 | agent 名称，LLM 调用时使用 |
| `description` | 是 | agent 用途描述 |
| `tools` | 否 | 可用工具列表（逗号分隔），不填则使用 pi 默认工具 |
| `model` | 否 | 指定模型，不填则使用 pi 默认模型 |

**Agent 定义发现规则**：

| 目录 | 作用域 | 说明 |
|------|--------|------|
| `~/.pi/agent/agents/*.md` | `user`（默认） | 所有项目可用 |
| `.pi/agents/*.md` | `project` | 仅当前项目可用 |

subagent 工具默认 `agentScope: "user"`，所以 `~/.pi/agent/agents/` 下的定义无需额外参数即可使用。

### 步骤 3：防止误提交（可选）

将 extension 加入 `.gitignore`：

```
# .gitignore
.pi/extensions/subagent
```

## 使用方式

启动 `pi` 交互模式后，用自然语言调用：

```
帮我用 inspect agent 执行一次完整设备巡检
```

或直接描述任务，LLM 判断需要巡检时会自动调用 subagent：

```
检查一下 VAV 设备的 CO2 传感器状态
```

subagent extension 支持三种模式：

| 模式 | 用法 | 场景 |
|------|------|------|
| single | `{ agent: "inspect", task: "执行巡检" }` | 单个任务 |
| parallel | `{ tasks: [{ agent: "inspect", task: "..." }, ...] }` | 多个独立任务并行 |
| chain | `{ chain: [{ agent: "inspect", task: "..." }, ...] }` | 顺序执行，`{previous}` 引用上一步输出 |

## 平台差异总结

| 事项 | macOS / Linux | Windows |
|------|---------------|---------|
| 安装 extension | `ln -s` | `xcopy` 或 `mklink /D`（需管理员） |
| 路径分隔符 | `/` | `/`（Git Bash 内） |
| python 命令 | `python` | `python`（Git Bash 内） |
| 设置环境变量 | `export` 写入 `~/.zshrc` | `export` 写入 `~/.bashrc`（Git Bash） |

核心原则：所有命令都通过 pi 的 bash 工具执行，bash 工具在所有平台使用 bash 语法（Windows 上通过 Git Bash），因此 `$ENV_VAR` 和 `/` 路径在所有平台通用。

## 相关文件

| 文件 | 说明 |
|------|------|
| `.pi/extensions/subagent/` | subagent extension |
| `~/.pi/agent/agents/inspect.md` | 设备巡检 agent 定义（跨平台） |
| `packages/coding-agent/examples/extensions/subagent/` | subagent extension 源码 |
| `packages/coding-agent/examples/device-inspection-agent/index.ts` | 独立运行的 inspect agent 脚本（跨平台） |
