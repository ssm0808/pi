<p align="center">
  <a href="https://pi.dev">
    <img alt="pi 标志" src="https://pi.dev/logo-auto.svg" width="128">
  </a>
</p>
<p align="center">
  <a href="https://discord.com/invite/3cU7Bz4UPx"><img alt="Discord" src="https://img.shields.io/badge/discord-community-5865F2?style=flat-square&logo=discord&logoColor=white" /></a>
</p>
<p align="center">
  <a href="https://pi.dev">pi.dev</a> 域名由以下项目慷慨捐赠
  <br /><br />
  <a href="https://exe.dev"><img src="packages/coding-agent/docs/images/exy.png" alt="Exy 吉祥物" width="48" /><br />exe.dev</a>
</p>

> 新贡献者提交的新 issue 和 PR 默认会自动关闭。维护者会每天审查自动关闭的 issue。请参阅 [CONTRIBUTING.md](CONTRIBUTING.md)。

---

# Pi Agent Harness 单体仓库

这是 pi agent harness 项目的主仓库，包含可自扩展的编码 Agent。

* **[@earendil-works/pi-coding-agent](packages/coding-agent)**：交互式编码 Agent CLI
* **[@earendil-works/pi-agent-core](packages/agent)**：支持工具调用和状态管理的 Agent 运行时
* **[@earendil-works/pi-ai](packages/ai)**：统一的多提供商 LLM API（OpenAI、Anthropic、Google 等）

了解更多 pi 信息：

* [访问 pi.dev](https://pi.dev)，查看项目网站和演示
* [阅读文档](https://pi.dev/docs/latest)，也可以直接让 Agent 解释自身

## 分享你的开源编码 Agent 会话

如果你使用 pi 或其他编码 Agent 参与开源工作，请分享你的会话。

公开的开源会话数据可以用真实任务、工具使用、失败和修复来改进编码 Agent，而不是只依赖玩具基准测试。

完整说明见 [这篇 X 帖子](https://x.com/badlogicgames/status/2037811643774652911)。

发布会话请使用 [`badlogic/pi-share-hf`](https://github.com/badlogic/pi-share-hf)。安装说明见它的 README.md。你只需要一个 Hugging Face 账号、Hugging Face CLI 和 `pi-share-hf`。

你也可以观看 [这个视频](https://x.com/badlogicgames/status/2041151967695634619)，了解我是如何发布自己的 `pi-mono` 会话的。

我会定期在这里发布自己的 `pi-mono` 工作会话：

- [badlogicgames/pi-mono on Hugging Face](https://huggingface.co/datasets/badlogicgames/pi-mono)

## 所有包

| 包 | 描述 |
|---------|-------------|
| **[@earendil-works/pi-ai](packages/ai)** | 统一的多提供商 LLM API（OpenAI、Anthropic、Google 等） |
| **[@earendil-works/pi-agent-core](packages/agent)** | 支持工具调用和状态管理的 Agent 运行时 |
| **[@earendil-works/pi-coding-agent](packages/coding-agent)** | 交互式编码 Agent CLI |
| **[@earendil-works/pi-tui](packages/tui)** | 支持差分渲染的终端 UI 库 |
| **[@earendil-works/pi-web-ui](packages/web-ui)** | 用于 AI 聊天界面的 Web 组件 |

Slack、聊天自动化和工作流请参阅 [earendil-works/pi-chat](https://github.com/earendil-works/pi-chat)。

## 贡献

贡献指南见 [CONTRIBUTING.md](CONTRIBUTING.md)，项目特定规则见 [AGENTS.md](AGENTS.md)（适用于人类和 Agent）。

## 开发

```bash
npm install          # 安装所有依赖
npm run build        # 构建所有包
npm run check        # 运行 lint、格式检查和类型检查
./test.sh            # 运行测试（没有 API key 时会跳过依赖 LLM 的测试）
./pi-test.sh         # 从源码运行 pi（可在任意目录执行）
```

> **注意：** `npm run check` 需要先运行 `npm run build`。web-ui 包使用 `tsc`，需要依赖包已编译生成的 `.d.ts` 文件。

## 许可证

MIT
