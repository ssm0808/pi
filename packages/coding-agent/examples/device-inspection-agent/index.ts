/**
 * 设备巡检专用 Agent — 基于 pi-coding-agent SDK（路径二派生）
 *
 * 使用方式：
 *   npx tsx index.ts "执行设备巡检"
 *   npx tsx index.ts "查看所有巡检规则"
 *   npx tsx index.ts "检查 VAV 设备的 CO2 传感器相关规则"
 *
 * 环境变量：
 *   DEVICE_INSPECTION_SKILL_DIR — skill 目录路径（默认 /Users/simon/01.code/skills/device-inspection）
 *   DEVICE_INSPECTION_API_URL  — 数据接口地址（默认 http://127.0.0.1:18080/fetch）
 *   MINIMAX_API_KEY              — MiniMax API key（或其他模型提供商的 key）
 */

import {
	createAgentSession,
	DefaultResourceLoader,
	getAgentDir,
	SessionManager,
	SettingsManager,
} from "@earendil-works/pi-coding-agent";

// ============================================================================
// 设备巡检 skill 路径 (根据你的实际路径调整)
// ============================================================================
const SKILL_DIR = process.env.DEVICE_INSPECTION_SKILL_DIR || "/Users/simon/01.code/skills/device-inspection";
const SCRIPTS_DIR = `${SKILL_DIR}/scripts`;
const RULES_DIR = `${SKILL_DIR}/rules`;
const JUDGE_SCRIPT = `${SCRIPTS_DIR}/judge_rules.py`;

// ============================================================================
// 系统提示词 — 定义 Agent 的身份、职责、工具使用方式和约束
// ============================================================================
const SYSTEM_PROMPT = `你是一个楼宇自控（BAS/HVAC）设备巡检专家 Agent。

## 核心职责

1. **运行设备巡检**：执行 ${JUDGE_SCRIPT}，对 VAV、AHU 等 HVAC 设备进行规则判定
2. **解读巡检结果**：分析告警信息，用通俗语言解释故障原因，给出可操作的处理建议
3. **管理巡检规则**：查看、解释和维护 ${RULES_DIR} 中的巡检规则

## 关键路径

| 路径 | 说明 |
|------|------|
| ${JUDGE_SCRIPT} | 巡检引擎脚本 |
| ${RULES_DIR}/rules.json | 主规则文件（7 条 VAV/AHU 规则） |
| ${RULES_DIR}/excel_import_rules.json | Excel 导入规则（23 条，含原因分析和处理建议） |
| ${RULES_DIR}/excel_id_aligned_7.json | Excel 规则体 + 统一 ID |
| ${RULES_DIR}/规则.txt | 规则中文说明文档 |

## 巡检命令

**执行完整巡检（首选）：**
\`\`\`bash
python ${JUDGE_SCRIPT} --fetch --json
\`\`\`

**API 不可用时使用自测模式：**
\`\`\`bash
python ${JUDGE_SCRIPT} --synthetic --json
\`\`\`

**合并额外规则后巡检：**
\`\`\`bash
python ${JUDGE_SCRIPT} --fetch --json --rules ${RULES_DIR}/rules.json --rules-extra ${RULES_DIR}/excel_import_rules.json
\`\`\`

**巡检并显示详细信息（匹配率、采样数）：**
\`\`\`bash
python ${JUDGE_SCRIPT} --fetch --json --details
\`\`\`

## 输出格式

脚本输出一个 JSON 对象：
\`\`\`json
{
  "fault_devices": ["AHU_001", "VAV_002"],
  "alerts_by_device": {
    "AHU_001": [
      {
        "device_id": "AHU_001",
        "rule_id": "...",
        "rule_name": "新风机组送风机变频器故障",
        "message": "告警：...",
        "reason_analysis": "...",
        "expert_advice": "..."
      }
    ]
  },
  "end_ts": 1700000000.0
}
\`\`\`

## 结果呈现要求

当巡检完成后，你必须：
1. 先输出摘要："共检查 N 台设备，发现 X 台设备存在 Y 条告警"
2. 按设备分组，逐条列出告警，每一条包含：
   - 设备 ID 和规则名称
   - 原因分析（优先使用规则中的 \`reason_analysis\`）
   - 专家处理建议（优先使用规则中的 \`expert_advice\`）
3. 如果全部正常，输出 "✅ 所有设备运行正常，无告警"
4. 不要添加"这是模拟数据"、"仅供参考"等免责声明
5. 对于空字段（\`—\`），说明该规则暂未配置原因分析或处理建议

## 工具使用规范

- **bash 工具**：运行巡检脚本。始终使用 \`--json\` 参数
- **read 工具**：查看规则文件、规则说明文档
- **grep 工具**：搜索特定设备或组件的相关规则
- **find 工具**：查找规则目录下的文件
- **ls 工具**：列出规则目录结构

## 约束

- 巡检是只读操作，不要修改 rules.json 除非用户明确要求
- 如果脚本执行报错，先检查 python 是否可用，再检查脚本路径和规则文件是否存在
- 如果数据接口不可用（连接拒绝），自动回退到 \`--synthetic\` 模式并告知用户
- 对于用户不熟悉的设备类型或规则，先查阅 ${RULES_DIR}/规则.txt
- 始终使用 JSON 输出格式，便于解析和呈现`;

// ============================================================================
// 创建并运行 Agent
// ============================================================================

import * as readline from "node:readline";

function createRl(): readline.Interface {
	return readline.createInterface({
		input: process.stdin,
		output: process.stdout,
		prompt: "\n🔍 巡检> ",
	});
}

async function _runSinglePrompt(session: Awaited<ReturnType<typeof createAgentSession>>["session"], prompt: string) {
	await session.prompt(prompt);
}

async function runInteractive(
	session: Awaited<ReturnType<typeof createAgentSession>>["session"],
	rl: readline.Interface,
) {
	console.log("🔍 设备巡检 Agent 交互模式");
	console.log("  输入巡检指令开始对话，输入 /exit 退出，输入 /help 查看帮助\n");

	let firstEventReceived = false;
	let warmTimeout: NodeJS.Timeout | null = null;

	const unsubscribe = session.subscribe((event) => {
		if (!firstEventReceived) {
			firstEventReceived = true;
			if (warmTimeout) {
				clearTimeout(warmTimeout);
				warmTimeout = null;
			}
			console.log("✅ 模型已响应，正在处理...\n");
		}
		if (event.type === "message_update") {
			const { assistantMessageEvent: ame } = event;
			if (ame.type === "text_delta") {
				process.stdout.write(ame.delta);
			} else if (ame.type === "thinking_delta") {
				process.stdout.write(ame.delta);
			}
		}
	});

	const ask = (): Promise<string> =>
		new Promise((resolve, reject) => {
			try {
				rl.question("\n🔍 巡检> ", (answer) => resolve(answer.trim()));
			} catch (err) {
				reject(err);
			}
		});

	try {
		while (true) {
			let input: string;
			try {
				input = await ask();
			} catch {
				break; // readline closed
			}

			if (!input) continue;
			if (input === "/exit" || input === "/quit" || input === "/q") {
				console.log("再见。");
				break;
			}
			if (input === "/help") {
				console.log(`
可用命令:
  /exit, /quit, /q  退出
  /help             显示此帮助
  /inspect          执行完整设备巡检（快捷指令）

直接输入自然语言即可与巡检 Agent 对话。
示例:
  - 执行设备巡检
  - 查看所有 VAV 相关规则
  - CO2 传感器告警的原因是什么
`);
				continue;
			}

			const prompt = input === "/inspect" ? "请执行一次完整的设备巡检。" : input;

			// 每个 prompt 开始前重置状态
			firstEventReceived = false;
			if (warmTimeout) clearTimeout(warmTimeout);
			warmTimeout = setTimeout(() => {
				if (!firstEventReceived) {
					console.log("⏳ 模型推理中（MiniMax-M2.7 首次响应约 20-40 秒），请耐心等待...");
				}
			}, 10000);

			console.log("⏳ 处理中...\n");
			try {
				await session.prompt(prompt);
			} catch (err) {
				console.error(`\n错误: ${err instanceof Error ? err.message : String(err)}`);
			} finally {
				if (warmTimeout) {
					clearTimeout(warmTimeout);
					warmTimeout = null;
				}
			}
			console.log("");
		}
	} finally {
		if (warmTimeout) clearTimeout(warmTimeout);
		unsubscribe();
		rl.close();
	}
}

async function main() {
	const args = process.argv.slice(2);
	const isInteractive = args.length === 0 || args.includes("-i") || args.includes("--interactive");
	const prompt = args.filter((a) => a !== "-i" && a !== "--interactive").join(" ");

	// 1. 创建资源加载器 — 注入设备巡检专用系统提示词
	const resourceLoader = new DefaultResourceLoader({
		cwd: process.cwd(),
		agentDir: getAgentDir(),
		noContextFiles: true, // 不加载 AGENTS.md，避免通用编码上下文干扰
		noExtensions: true, // 不加载 coding extensions，保持 Agent 职责单一
		systemPromptOverride: (basePrompt) => {
			if (basePrompt) {
				return `${SYSTEM_PROMPT}\n\n---\n## 额外上下文\n${basePrompt}`;
			}
			return SYSTEM_PROMPT;
		},
	});

	await resourceLoader.reload();

	// 2. 创建 Agent 会话
	const { session } = await createAgentSession({
		resourceLoader,
		tools: ["bash", "read", "grep", "find", "ls"],
		sessionManager: SessionManager.inMemory(process.cwd()),
		settingsManager: SettingsManager.inMemory({
			compaction: { enabled: true },
		}),
	});

	if (isInteractive) {
		// 交互模式 — 类似 pi 命令的对话体验
		const rl = createRl();
		try {
			await runInteractive(session, rl);
		} finally {
			session.dispose();
		}
	} else {
		// 单次命令模式
		const unsubscribe = session.subscribe((event) => {
			if (event.type === "message_update") {
				const { assistantMessageEvent: ame } = event;
				if (ame.type === "text_delta") {
					process.stdout.write(ame.delta);
				} else if (ame.type === "thinking_delta") {
					process.stdout.write(ame.delta);
				} else if (ame.type === "thinking_start") {
					console.log("🧠 思考中...\n");
				}
			}
		});
		try {
			console.log(`[设备巡检 Agent] 收到指令: ${prompt}\n`);
			await session.prompt(prompt);
			console.log("\n");
		} finally {
			unsubscribe();
			session.dispose();
		}
	}
}

main().catch((err) => {
	console.error("设备巡检 Agent 运行失败:", err);
	process.exit(1);
});
