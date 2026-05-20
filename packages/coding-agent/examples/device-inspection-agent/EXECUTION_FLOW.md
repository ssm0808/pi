# 设备巡检 Agent 执行流程

## 概述

pi 通过两层进程 + 三层组件协作完成设备巡检。核心机制：subagent extension 读取 agent 定义，启动独立子 pi 进程执行任务，结果回传主 pi。

## 执行流程

### 第 1 步：用户输入

```
> 用 inspect agent 执行一次设备巡检
```

主 pi 的 LLM 收到 prompt，在可用工具列表中看到 `subagent`（由 extension 注册），判断需要委托给 inspect agent。LLM 调用 subagent 工具：

```json
{ "agent": "inspect", "task": "执行设备巡检" }
```

### 第 2 步：subagent extension 接管

subagent extension（`.pi/extensions/subagent/index.ts`）的 `execute` 函数被触发：

**2.1 发现 agent 定义**

`discoverAgents()` 扫描 `~/.pi/agent/agents/*.md`，找到 `inspect.md`，解析其 YAML frontmatter：

- `name: inspect`
- `tools: bash, read, grep, find, ls`
- 正文 = 设备巡检系统提示词（专家身份、巡检命令、路径、输出格式）

**2.2 写入临时文件**

将系统提示词正文写入临时文件：

```
/tmp/pi-subagent-xxxxx/prompt-inspect.md
```

**2.3 启动子 pi 进程**

`spawn()` 启动独立 pi 进程：

```bash
pi --mode json \
   --no-session \
   --tools bash,read,grep,find,ls \
   --append-system-prompt /tmp/pi-subagent-xxxxx/prompt-inspect.md \
   "Task: 执行设备巡检"
```

参数说明：

| 参数 | 作用 |
|------|------|
| `--mode json` | JSONL 格式输出，父进程按行解析 |
| `--no-session` | 不持久化，独立会话 |
| `--tools` | 仅授予只读工具，不能写文件 |
| `--append-system-prompt` | 注入巡检专家提示词 |

### 第 3 步：子 pi 进程执行任务

子 pi 是一个受限的独立 pi 实例，上下文与主 pi 完全隔离。

**3.1 子 LLM 分析任务**

子 LLM 看到的系统提示词是巡检专家身份，工具集只有 bash/read/grep/find/ls。LLM 判断"执行设备巡检" = 运行 `judge_rules.py`。

**3.2 调用 bash 工具**

子 LLM 构造命令：

```bash
python $DEVICE_INSPECTION_SKILL_DIR/scripts/judge_rules.py --fetch --json
```

**3.3 Shell 执行 Python 脚本**

pi 的 bash 工具调用系统 shell：

- macOS/Linux：`/bin/bash -c "<command>"`
- Windows：`bash.exe -c "<command>"`（Git Bash）

Shell 展开环境变量 `$DEVICE_INSPECTION_SKILL_DIR` 为实际路径，执行 Python 脚本。

**3.4 Python 脚本工作流**

```
judge_rules.py
  │
  ├── --fetch → 从 http://127.0.0.1:18080/fetch 拉取设备实时数据
  │
  ├── 加载 rules.json（规则定义）
  │
  ├── 逐设备、逐规则匹配判定
  │   ├── 数据正常 → 跳过
  │   └── 触发规则 → 记录告警（含原因分析和处理建议）
  │
  └── 输出 JSON
```

**3.5 子 LLM 解读结果**

收到 JSON 后，按系统提示词中的"结果呈现要求"格式化：

1. 先输出摘要："共检查 N 台设备，发现 X 台设备存在 Y 条告警"
2. 按设备分组，逐条列出告警
3. 每条包含：设备 ID、规则名、原因分析、处理建议
4. 全部正常则输出"所有设备运行正常，无告警"

**3.6 子 pi 进程结束**

stdout 输出完整的 JSONL 事件流，进程退出。

### 第 4 步：结果回传

subagent extension 逐行解析子 pi 的 JSONL 输出：

```typescript
// 伪代码
proc.stdout.on("data", (data) => {
  const event = JSON.parse(line);
  if (event.type === "message_end") {
    currentResult.messages.push(event.message);
  }
  // ...
});
```

提取最终文本结果，作为 subagent 工具返回值交还给主 pi LLM。主 LLM 把结果呈现给用户。

## 完整调用链

```
用户输入
  │
  ▼
主 pi LLM
  │ 调用 subagent 工具
  │ { agent: "inspect", task: "执行设备巡检" }
  ▼
subagent extension
  │ 读取 ~/.pi/agent/agents/inspect.md
  │ 解析 YAML 配置 + 系统提示词
  │
  │ spawn 子 pi 进程
  │ --mode json --no-session
  │ --tools bash,read,grep,find,ls
  │ --append-system-prompt <提示词>
  ▼
子 pi LLM（独立上下文，只读工具）
  │
  │ 调用 bash 工具
  │ python $DEVICE_INSPECTION_SKILL_DIR/scripts/judge_rules.py --fetch --json
  ▼
系统 Shell
  │ 展开 $DEVICE_INSPECTION_SKILL_DIR
  │ 执行 Python 脚本
  ▼
judge_rules.py
  │ --fetch：拉取设备数据
  │ 逐设备匹配规则
  │ 输出 JSON 告警列表
  ▼
子 pi LLM
  │ 解读 JSON
  │ 格式化巡检报告
  ▼
subagent extension
  │ 解析 JSONL
  │ 提取最终文本
  ▼
主 pi LLM
  │ 呈现巡检结果
  ▼
用户看到巡检报告
```

## 关键设计点

### 上下文隔离

子 pi 是独立进程，有自己的上下文窗口。巡检过程产生的所有对话、工具输出、JSON 数据都不会进入主 pi 的上下文，不会挤占主对话的令牌预算。

### 最小权限

子 pi 只有 `bash, read, grep, find, ls` 五个只读工具。即使 LLM 产生幻觉或被提示注入，也无法修改文件、安装依赖或执行破坏性操作。

### 跨平台一致性

pi 的 bash 工具在**所有平台上使用 bash 语法**（Windows 通过 Git Bash）：
- `$ENV_VAR` 环境变量展开：全平台一致
- `/` 路径分隔符：全平台一致
- `python` 命令：全平台一致

因此同一份 `inspect.md` 提示词在 macOS、Linux、Windows 上无需修改即可使用。

### Agent 定义的热加载

`inspect.md` 是普通文本文件，修改后下次调用自动生效，无需重启 pi 或重新编译。agent 定义在每次 subagent 调用时由 `discoverAgents()` 重新读取。
