# 设备巡检 Agent — 总结

## 做了什么

基于 pi 框架实现了楼宇自控（BAS/HVAC）设备巡检 Agent，支持两种运行方式和跨平台部署。

### 方式 A：独立运行（路径二派生）

基于 `pi-coding-agent` SDK 派生，直接运行 `index.ts`：

```
node --import tsx/esm index.ts "执行设备巡检"
```

特点：独立进程，有自己的系统提示词、工具集（bash/read/grep/find/ls，只读）、交互模式。

### 方式 B：作为 pi 子 Agent（路径三派生）

通过 extension + markdown agent definition 注册到 pi 中，从 pi 对话中直接调用：

```
pi
> 用 inspect agent 执行一次设备巡检
```

特点：主 pi 通过 subagent extension 发现并启动独立子 pi 进程，上下文隔离，最小权限。

## 核心文件

| 文件 | 说明 |
|------|------|
| `index.ts` | 独立运行的巡检 Agent（路径二） |
| `pi-inspect` | 独立运行的 shell 脚本 |
| `~/.pi/agent/agents/inspect.md` | Agent 定义（YAML + 系统提示词），在用户级 agents 目录 |
| `.pi/extensions/subagent` | subagent extension 的 symlink，指向示例代码 |
| `README.md` | 使用说明 |
| `EXECUTION_FLOW.md` | 完整执行流程（4 步 + 调用链图） |
| `REGISTER_AS_SUBAGENT.md` | 子 Agent 注册操作指南 |

## 架构要点

### Agent 的三层结构

```
模型层 (@earendil-works/pi-ai)          → 统一多模型提供商的流式接口
Agent 核心层 (@earendil-works/pi-agent-core) → Agent loop、消息状态、工具调用
编码 Agent 层 (@earendil-works/pi-coding-agent) → 文件工具、会话、AGENTS.md、skills、TUI
```

### Agent = 运行时能力组合

```
Agent = 模型 + 系统提示词 + 工具集 + Agent Loop
```

不是继承基类，而是组合这些能力定义一个新 Agent。子 Agent 是这个组合体的受限版本。

### 执行流程

```
用户 → 主 pi → subagent 工具 → 读取 inspect.md
     → spawn 子 pi 进程（独立上下文，只读工具）
     → 子 LLM → bash 工具 → python judge_rules.py
     → 拉取设备数据 → 匹配规则 → 输出 JSON
     → 子 LLM 解读 → 格式化报告 → 回传主 pi
```

## 跨平台支持

通过环境变量 `DEVICE_INSPECTION_SKILL_DIR` 适配路径：

```bash
# macOS / Linux
export DEVICE_INSPECTION_SKILL_DIR=/Users/simon/01.code/skills/device-inspection

# Windows (Git Bash)
export DEVICE_INSPECTION_SKILL_DIR=/d/code/skills/device-inspection
```

所有命令在 bash 中执行，`$ENV_VAR` 和 `/` 路径全平台通用（Windows 通过 Git Bash）。

## 关键设计

- **上下文隔离**：子 pi 独立进程，不污染主对话
- **最小权限**：只读工具（bash/read/grep/find/ls），不能修改文件
- **Agent 定义热加载**：修改 `inspect.md` 无需重启
- **subagent 工具发现**：自动扫描 `~/.pi/agent/agents/*.md` 和 `.pi/agents/*.md`

## 相关文档

- `DERIVE_AGENT.md` / `DERIVE_AGENT.zh.md` — Agent 派生原理（三层架构、三条路径）
- `DEVICE_CONTROL_AGENT.md` — 设备控制 Agent 派生示例
