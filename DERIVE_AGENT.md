# 基于 pi Agent 框架派生新 Agent

## 对话结论

基于 pi 派生新 Agent，本质上不是继承某个基类，而是重新组合 pi 提供的运行时能力：

- 模型选择。
- 系统提示词。
- 工具集合。
- 上下文转换。
- 工具调用前后的安全策略。
- 会话、配置、扩展、skills、AGENTS.md 等外层能力。

pi 的 Agent 能力分三层：

| 层级 | 包 | 作用 |
|---|---|---|
| 模型层 | `@earendil-works/pi-ai` | 抽象多模型提供商，提供统一流式接口。 |
| Agent 核心层 | `@earendil-works/pi-agent-core` | 提供 Agent loop、消息状态、工具调用和事件流。 |
| 编码 Agent 层 | `@earendil-works/pi-coding-agent` | 在核心 Agent 上加入文件工具、会话、配置、AGENTS.md、skills、extensions、CLI/TUI 等能力。 |

因此，派生新 Agent 主要有三种方式：

1. 用 `pi-agent-core` 直接创建独立 Agent。
2. 用 `pi-coding-agent` SDK 创建专用编码 Agent。
3. 用 extension 加 markdown agent definition 创建专业子 Agent。

## Agent loop 原理

`Agent` 的核心运行逻辑是一个循环：

```text
用户输入
  -> AgentMessage
  -> transformContext
  -> convertToLlm
  -> streamFn 调用模型
  -> assistant message
  -> 如果有 toolCall，执行 AgentTool
  -> toolResult 回到上下文
  -> 继续调用模型或结束
```

关键点：

- `AgentMessage` 是 pi 内部消息类型，可以扩展自定义消息。
- `convertToLlm` 把内部消息转换成模型能理解的消息。
- `transformContext` 在模型调用前裁剪、压缩或注入上下文。
- `streamFn` 是实际模型调用入口。
- `AgentTool` 定义本地工具，模型只看到工具 schema。
- 运行过程中持续产生事件，UI、CLI、日志或扩展可以订阅。

## 方法一：用 `pi-agent-core` 派生独立通用 Agent

### 使用场景

适合做一个和 pi CLI 无关的独立 Agent，例如：

- 日志诊断 Agent。
- 客服问答 Agent。
- 内部知识库 Agent。
- Slack/企业微信机器人。
- 嵌入 Web 服务、桌面 App、VS Code 插件或自定义 CLI 的 Agent。

这里的“和 pi CLI 无关”不是指不能通过 CLI 控制，而是指不依赖 pi 自带 CLI/TUI 运行。你可以用自己的程序、Web API 或自己的 CLI 控制它。

架构关系是：

```text
你的应用
  -> pi-agent-core
    -> pi-ai
```

而不是：

```text
pi CLI
  -> pi-coding-agent
    -> pi-agent-core
      -> pi-ai
```

### 具体例子：日志诊断 Agent

这个 Agent 只分析用户提供的日志，不读写文件，也不使用 pi 的项目规则加载。

```ts
import { Agent, type AgentTool } from "@earendil-works/pi-agent-core";
import { getModel } from "@earendil-works/pi-ai";
import { Type } from "typebox";

const summarizeLogParameters = Type.Object({
  log: Type.String(),
});

const summarizeLogTool: AgentTool<typeof summarizeLogParameters, { lineCount: number }> = {
  name: "summarize_log",
  label: "Summarize Log",
  description: "Summarizes a log string and returns basic metadata.",
  parameters: summarizeLogParameters,
  execute: async (_toolCallId, params) => {
    const lineCount = params.log.split("\n").length;
    return {
      content: [{ type: "text", text: `日志共 ${lineCount} 行。` }],
      details: { lineCount },
    };
  },
};

const model = getModel("anthropic", "claude-sonnet-4-20250514");
if (!model) {
  throw new Error("Model not found");
}

const agent = new Agent({
  initialState: {
    systemPrompt: "你是日志诊断 Agent。只分析错误原因、影响范围和修复建议。",
    model,
    thinkingLevel: "medium",
    tools: [summarizeLogTool],
  },
});

agent.subscribe((event) => {
  if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
    process.stdout.write(event.assistantMessageEvent.delta);
  }
});

await agent.prompt("分析这段日志：...");
```

### 原理

这种方式只使用底层 Agent loop。你完全控制：

- prompt。
- 模型。
- 工具。
- 消息格式。
- 上下文管理。
- 会话保存。
- UI 或 API 暴露方式。

它适合产品级自定义，因为依赖少、边界清晰、可控性高。

## 方法二：用 `pi-coding-agent` SDK 派生专用代码 Agent

### 使用场景

适合在 pi 现有编码能力上定制一个专用 Agent，例如：

- 数据库迁移审查 Agent。
- 安全扫描 Agent。
- 只读代码审查 Agent。
- 文档生成 Agent。
- 可执行修复 Agent。

它复用 pi 的：

- 文件读取、搜索、编辑、写入、bash 工具。
- `AGENTS.md` 项目规则。
- skills。
- extensions。
- slash commands。
- 会话和设置管理。

### 具体例子：数据库迁移审查 Agent

这个 Agent 可以读文件、搜索代码、执行诊断命令，但不允许编辑或写入文件。

```ts
import {
  createAgentSession,
  DefaultResourceLoader,
  getAgentDir,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";

const resourceLoader = new DefaultResourceLoader({
  cwd: process.cwd(),
  agentDir: getAgentDir(),
  systemPromptOverride: (basePrompt) => `${basePrompt}

你是数据库迁移审查 Agent。
只关注 schema 兼容性、数据迁移风险、锁表风险、回滚方案和验证步骤。`,
});

await resourceLoader.reload();

const { session } = await createAgentSession({
  resourceLoader,
  tools: ["read", "grep", "find", "ls", "bash"],
  sessionManager: SessionManager.inMemory(process.cwd()),
  settingsManager: SettingsManager.inMemory({
    compaction: { enabled: true },
  }),
});

try {
  session.subscribe((event) => {
    if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
      process.stdout.write(event.assistantMessageEvent.delta);
    }
  });

  await session.prompt("审查当前分支里的数据库迁移。");
} finally {
  session.dispose();
}
```

### 原理

`createAgentSession()` 会帮你创建完整的 coding agent session：

```text
createAgentSession()
  -> 创建 Agent
  -> 加载系统 prompt、AGENTS.md、skills、extensions、prompts
  -> 注册内置工具和扩展工具
  -> 接入 SessionManager 和 SettingsManager
  -> 暴露 session.prompt()
```

这种方式不是从零造 Agent，而是在 pi 现有编码 Agent 上换身份、限工具、换配置。

核心控制点：

| 控制点 | 作用 |
|---|---|
| `systemPromptOverride` | 改变 Agent 身份和任务边界。 |
| `tools` | 限制工具能力，例如只读、允许 bash、允许写入。 |
| `SessionManager` | 控制会话是否持久化。 |
| `SettingsManager` | 控制压缩、重试、传输和默认设置。 |
| `DefaultResourceLoader` | 控制 AGENTS.md、skills、extensions 等资源加载。 |

## 方法三：用 extension 派生专业子 Agent

### 使用场景

适合主 Agent 运行时，把任务委派给不同专家 Agent，例如：

- `scout`：快速侦察代码位置。
- `planner`：制定实现计划。
- `worker`：执行修改。
- `reviewer`：审查风险和遗漏。

它解决的是“分工协作”问题，而不是替换主 Agent。

### 具体例子：迁移审查子 Agent

子 Agent 可以用 markdown 文件定义：

```md
---
name: db-reviewer
description: Reviews database migrations
tools: read, grep, find, ls
model: claude-sonnet-4-20250514
---

你是数据库迁移审查 Agent。

重点检查：

- schema 兼容性
- 数据迁移风险
- 锁表和性能风险
- 回滚方案
- 是否缺少测试或验证步骤
```

常见位置：

- 用户级：`~/.pi/agent/agents/*.md`
- 项目级：`.pi/agents/*.md`

### 原理

主 Agent 通过 extension 注册的委派工具调用子 Agent：

```text
主 Agent
  -> 调用 subagent 工具
  -> 选择 db-reviewer
  -> 子 Agent 使用自己的 prompt、tools、model 和上下文
  -> 子 Agent 输出结论
  -> 结论回到主 Agent
```

这种方式的特点：

- 子 Agent 有独立上下文。
- 子 Agent 可以限制工具范围。
- 子 Agent 可以选择不同模型。
- 多个子 Agent 可以并行或串行协作。
- 主 Agent 负责整合结果和继续执行。

## 三种方式对比

| 目标 | 推荐方式 | 原因 |
|---|---|---|
| 做独立 Agent 产品 | `new Agent()` | 不依赖 pi CLI/TUI，完全自控。 |
| 做专用代码分析 Agent | `createAgentSession()` | 复用 pi 文件工具、会话和项目规则。 |
| 做只读代码审查 Agent | `createAgentSession()` 加只读工具 | 通过工具 allowlist 控制风险。 |
| 做可执行修复 Agent | `createAgentSession()` 加 `edit`、`write`、`bash` | 保留完整编码能力。 |
| 做多 Agent 分工 | extension 加 markdown agent definitions | 每个专家有独立 prompt、工具和上下文。 |
| 接私有模型网关 | 自定义 `streamFn` | 替换实际模型调用入口。 |
| 做自定义消息协议 | 自定义 `AgentMessage`、`convertToLlm`、`transformContext` | 控制模型看到的上下文。 |

## 选择建议

如果你要的是一个独立产品，用 `pi-agent-core`。

如果你要的是一个专用版 pi 编码 Agent，用 `pi-coding-agent` SDK。

如果你要的是主 Agent 内部分工协作，用 extension 子 Agent。

一句话概括：

```text
pi-agent-core 是造一个独立 Agent。
pi-coding-agent SDK 是改装 pi 编码 Agent。
extension 子 Agent 是给主 Agent 增加专家分工。
```
