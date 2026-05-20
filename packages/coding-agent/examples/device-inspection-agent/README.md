# 设备巡检专用 Agent

基于 pi-coding-agent SDK（路径二）派生的楼宇自控（BAS/HVAC）设备巡检 Agent。

## 跨平台支持

Agent 本身跨平台（macOS / Linux / Windows Git Bash）。

通过环境变量 `DEVICE_INSPECTION_SKILL_DIR` 适配不同平台的路径：

```bash
# macOS / Linux
export DEVICE_INSPECTION_SKILL_DIR=/Users/simon/01.code/skills/device-inspection

# Windows (Git Bash)
export DEVICE_INSPECTION_SKILL_DIR=/d/code/skills/device-inspection
```

## 派生设计

| 派生点 | 选择 |
|--------|------|
| `systemPrompt` | 替换为 HVAC 设备巡检专家 prompt |
| `model` | 使用默认模型（通过 `--model` 或 settings 指定） |
| `tools` | `["bash", "read", "grep", "find", "ls"]` — 只读 + 巡检执行 |
| `noContextFiles` | `true` — 不加载 AGENTS.md，避免通用编码上下文干扰 |
| `noExtensions` | `true` — 不加载扩展，保持 Agent 职责单一 |
| `sessionManager` | `InMemory` — 不持久化，每次巡检独立 |
| `compaction` | 启用 — 长对话自动压缩上下文 |

## 前置条件

1. 安装依赖（在 monorepo 根目录）：
   ```bash
   npm install
   ```

2. 设置环境变量：
   ```bash
   export DEVICE_INSPECTION_SKILL_DIR=/path/to/skills/device-inspection
   ```

3. 确保设备巡检脚本存在：
   ```bash
   ls "$DEVICE_INSPECTION_SKILL_DIR/scripts/judge_rules.py"
   ```

4. 设置模型 API Key：
   ```bash
   export MINIMAX_API_KEY="your-key"
   ```

## 使用方式

### 交互模式

```bash
# pi 原生调用（推荐，通过 extension + agent definition）
pi

# 然后在 pi 中：
# > 用 inspect agent 执行一次设备巡检
```

### 单次命令模式（直接运行独立脚本）

```bash
# npm script
npm run inspect "执行设备巡检"

# shell 脚本
./packages/coding-agent/examples/device-inspection-agent/pi-inspect "执行设备巡检"

# 直接调用
node --import tsx/esm packages/coding-agent/examples/device-inspection-agent/index.ts "执行设备巡检"
```

## 环境变量

| 变量 | 说明 |
|------|------|
| `DEVICE_INSPECTION_SKILL_DIR` | 巡检 skill 目录路径（必填） |
| `DEVICE_INSPECTION_API_URL` | 巡检数据接口地址（默认 `http://127.0.0.1:18080/fetch`） |
| `MINIMAX_API_KEY` | MiniMax 模型 API Key |
| `PI_CODING_AGENT_DIR` | Agent 配置目录（默认 `~/.pi/agent/`） |

## 工作原理

```
用户输入 "执行设备巡检"
       │
       ▼
  Agent 解析意图 → 决定调用 bash 工具
       │
       ▼
  bash: python $DEVICE_INSPECTION_SKILL_DIR/scripts/judge_rules.py --fetch --json
       │
       ▼
  脚本返回 JSON → Agent 解读结果
       │
       ▼
  按设备分组输出告警、原因分析、处理建议
```

## 自定义

- **修改系统提示词**：编辑 `index.ts` 中的 `SYSTEM_PROMPT` 常量
- **修改工具集**：调整 `tools` 数组（如添加 `edit` 允许修改规则）
- **修改模型**：运行时传 `--model minimax/MiniMax-M2.7`
