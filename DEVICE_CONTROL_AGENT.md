# 设备控制 Agent 派生示例

## 场景

假设业务系统已经提供了一个专业设备控制 Agent 方法：

```ts
export async function runDeviceControlAgent(
  request: DeviceControlRequest,
): Promise<DeviceControlResult>;
```

这个方法负责真正控制设备，例如：

- 打开或关闭设备。
- 调整空调温度。
- 重启设备。
- 调用 IoT 网关、PLC、MQTT、HTTP API 或其他设备平台。

pi 派生出来的新 Agent 不直接控制设备，而是把这个业务方法包装成 pi 工具，让模型通过工具调用设备控制能力。

## 调用链原理

```text
用户
  -> pi 派生 Agent
  -> 理解用户意图
  -> 判断是否需要控制设备
  -> 调用 device_control 工具
  -> 工具内部调用 runDeviceControlAgent()
  -> 返回设备执行结果
  -> Agent 根据工具结果回复用户
```

核心原则：

- 派生 Agent 负责理解、调度和解释结果。
- 业务设备控制 Agent 负责真实执行设备指令。
- `AgentTool` 是 pi 和业务方法之间的适配层。
- 工具返回结果是唯一可信的执行状态。
- Agent 不能绕过工具自行声称设备已执行。

## 业务方法示例

```ts
export interface DeviceControlRequest {
  deviceId: string;
  action: "turn_on" | "turn_off" | "set_temperature" | "reboot";
  value?: number;
  reason: string;
}

export interface DeviceControlResult {
  ok: boolean;
  deviceId: string;
  action: string;
  message: string;
}

export async function runDeviceControlAgent(
  request: DeviceControlRequest,
): Promise<DeviceControlResult> {
  // 这里调用你的设备平台、IoT 网关、PLC、MQTT、HTTP API 等。
  return {
    ok: true,
    deviceId: request.deviceId,
    action: request.action,
    message: "设备指令已下发",
  };
}
```

## 方法一：基于 `pi-agent-core`

### 适用场景

适合做一个独立设备控制 Agent，例如：

- 智能楼宇控制助手。
- 会议室设备控制助手。
- 工业设备诊断和控制助手。
- 嵌入 Web 服务、移动端、桌面端或自定义 CLI 的设备控制 Agent。

它不依赖 pi CLI/TUI，架构是：

```text
你的应用
  -> pi-agent-core Agent
    -> device_control AgentTool
      -> runDeviceControlAgent()
```

### 示例代码

```ts
import { Agent, type AgentTool } from "@earendil-works/pi-agent-core";
import { getModel } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import {
  type DeviceControlResult,
  runDeviceControlAgent,
} from "./device-control-agent.js";

const deviceControlParameters = Type.Object({
  deviceId: Type.String(),
  action: Type.Union([
    Type.Literal("turn_on"),
    Type.Literal("turn_off"),
    Type.Literal("set_temperature"),
    Type.Literal("reboot"),
  ]),
  value: Type.Optional(Type.Number()),
  reason: Type.String(),
});

const deviceControlTool: AgentTool<
  typeof deviceControlParameters,
  DeviceControlResult
> = {
  name: "device_control",
  label: "Device Control",
  description: "Controls a device through the business device-control agent.",
  parameters: deviceControlParameters,
  execute: async (_toolCallId, params) => {
    const result = await runDeviceControlAgent(params);

    return {
      content: [{ type: "text", text: result.message }],
      details: result,
    };
  },
};

const model = getModel("anthropic", "claude-sonnet-4-20250514");
if (!model) {
  throw new Error("Model not found");
}

const agent = new Agent({
  initialState: {
    model,
    thinkingLevel: "medium",
    systemPrompt: `
你是设备控制协调 Agent。
当用户要求控制设备时，必须调用 device_control 工具。
不要假装设备已被控制，必须以工具返回结果为准。
高风险操作必须说明原因。
`,
    tools: [deviceControlTool],
  },
  beforeToolCall: async ({ toolCall, args }) => {
    if (toolCall.name !== "device_control") {
      return undefined;
    }

    const request = args as { action?: string };
    if (request.action === "reboot") {
      return {
        block: true,
        reason: "设备重启属于高风险操作，需要外部确认流程。",
      };
    }

    return undefined;
  },
});

await agent.prompt("把 meeting-room-1 的空调温度调到 23 度");
```

### 原理

这个派生 Agent 是设备控制协调者：

- 模型负责理解自然语言指令。
- `device_control` 工具负责把结构化参数传给业务设备控制 Agent。
- `beforeToolCall` 负责在执行前做安全拦截。
- `runDeviceControlAgent()` 负责真实设备控制。
- 工具结果回到模型后，模型再向用户解释执行结果。

## 方法二：基于 `pi-coding-agent`

### 适用场景

适合设备控制还依赖项目文件、配置、设备映射表或运行环境的情况，例如：

- 设备 ID 需要从仓库配置文件读取。
- 控制策略需要参考项目文档。
- 需要搜索设备分组、场景配置或权限规则。
- 需要保留 pi 的会话、AGENTS.md、skills、extensions 和内置文件工具。

架构是：

```text
你的应用
  -> pi-coding-agent createAgentSession()
    -> read/grep/find/ls 收集设备配置上下文
    -> device_control customTool
      -> runDeviceControlAgent()
```

### 示例代码

```ts
import {
  createAgentSession,
  DefaultResourceLoader,
  getAgentDir,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import {
  type DeviceControlResult,
  runDeviceControlAgent,
} from "./device-control-agent.js";

const deviceControlParameters = Type.Object({
  deviceId: Type.String(),
  action: Type.Union([
    Type.Literal("turn_on"),
    Type.Literal("turn_off"),
    Type.Literal("set_temperature"),
    Type.Literal("reboot"),
  ]),
  value: Type.Optional(Type.Number()),
  reason: Type.String(),
});

const deviceControlTool = {
  name: "device_control",
  label: "Device Control",
  description: "Controls a device through the business device-control agent.",
  parameters: deviceControlParameters,
  execute: async (_toolCallId: string, params: {
    deviceId: string;
    action: "turn_on" | "turn_off" | "set_temperature" | "reboot";
    value?: number;
    reason: string;
  }): Promise<{ content: Array<{ type: "text"; text: string }>; details: DeviceControlResult }> => {
    const result = await runDeviceControlAgent(params);

    return {
      content: [{ type: "text", text: result.message }],
      details: result,
    };
  },
};

const resourceLoader = new DefaultResourceLoader({
  cwd: process.cwd(),
  agentDir: getAgentDir(),
  systemPromptOverride: (basePrompt) => `${basePrompt}

你是设备控制 Agent。
你可以先读取配置文件或搜索项目文档，确认设备 ID、位置和控制策略。
当用户要求控制设备时，必须调用 device_control 工具。
不要自行声称设备已被控制，必须以工具返回结果为准。`,
});

await resourceLoader.reload();

const { session } = await createAgentSession({
  resourceLoader,
  customTools: [deviceControlTool],
  tools: ["read", "grep", "find", "ls", "device_control"],
  sessionManager: SessionManager.inMemory(process.cwd()),
  settingsManager: SettingsManager.inMemory({
    compaction: { enabled: true },
  }),
});

try {
  await session.prompt("把会议室 A 的投影仪打开。");
} finally {
  session.dispose();
}
```

### 原理

这个方式把设备控制能力接入完整的 pi coding agent session：

- `read`、`grep`、`find`、`ls` 用来查设备配置和项目文档。
- `device_control` 是业务设备控制工具。
- `tools` allowlist 控制 Agent 只能读配置和调用设备控制，不能编辑项目文件。
- `DefaultResourceLoader` 继续加载 pi 的系统提示词、AGENTS.md、skills 和 extensions。
- `SessionManager` 和 `SettingsManager` 保留会话与运行配置能力。

## 安全边界

设备控制属于高风险场景，安全边界应放在工具层，而不是只靠 prompt。

建议至少实现：

| 风险 | 建议 |
|---|---|
| 非法设备 ID | 在工具执行前校验设备是否存在、是否归当前用户或租户所有。 |
| 高风险动作 | 对 `reboot`、`shutdown`、`unlock` 等动作增加确认流程。 |
| 参数越界 | 对温度、速度、功率等数值设置上下限。 |
| 权限绕过 | 工具内部根据用户身份和设备权限做校验。 |
| 误报执行状态 | 只允许根据工具返回结果向用户说明执行状态。 |
| 审计缺失 | 记录操作者、设备、动作、参数、原因和执行结果。 |

可以通过 `beforeToolCall` 做执行前拦截，也可以在 `runDeviceControlAgent()` 内部做强校验。生产环境中，业务方法内部的权限校验必须存在，因为 prompt 和模型输出不能作为安全边界。

## 推荐选择

如果设备控制 Agent 不需要 pi 的文件工具和项目规则，用 `pi-agent-core`：

```text
独立设备控制产品
  -> new Agent()
  -> device_control 工具
```

如果设备控制 Agent 需要读取项目配置、设备映射或复用 pi 的编码 Agent 能力，用 `pi-coding-agent`：

```text
项目内设备控制助手
  -> createAgentSession()
  -> read/grep/find/ls
  -> device_control customTool
```

一句话总结：

```text
pi 派生 Agent 负责理解意图和调度。
device_control 工具负责适配 pi 与业务方法。
runDeviceControlAgent() 负责真实设备控制和业务安全校验。
```
