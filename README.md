# Codin

[![CI Status](https://img.shields.io/github/actions/workflow/status/open-source/codin/release.yml?branch=main&label=CI)](https://github.com/open-source/codin/actions)
[![Marketplace Version](https://img.shields.io/visual-studio-marketplace/v/open-source.codin.svg)](https://marketplace.visualstudio.com/items?itemName=open-source.codin)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

**Your AI coding agent, powered by your own subscription**

Codin is a free, open-source AI coding assistant for VS Code. It works as an autonomous agent right inside your editor, allowing you to give it high-level tasks. It will plan the steps, search your codebase, write files, and run commands—all while asking for your approval before modifying anything.

## Get started free

You choose the AI model that powers Codin. No lock-in, no markups.

| Path | Cost | Setup time |
|---|---|---|
| **Ollama (local)** | Free forever | ~5 min |
| **Gemini free API** | Free (15 req/min) | ~2 min |
| **Groq free API** | Free (~100 req/min) | ~2 min |
| **Your API key** | Pay per use (cents) | ~1 min |

## Features

- **Agent Loop**: Advanced reasoning loop (plan → execute → verify).
- **10 Built-in Tools**: Read/write files, create/delete files, run terminal commands, grep codebase, list files, git status, git commit, and open a browser.
- **14 LLM Providers**: Bring your own key for Claude, OpenAI, Gemini, DeepSeek, and more.
- **Approval System**: Inline diff views to approve or reject every single file edit. 
- **Dry Run Mode**: See exactly what the agent would do before executing any tools.
- **Task History**: Conversations and context are saved automatically per project.

## Quick Start

1. **Install** Codin from the VS Code Marketplace.
2. **Setup Wizard**: Upon first launch, the wizard will guide you through setting up a free local AI, a free cloud API, or your existing API key.
3. **Start Coding**: Open the Codin sidebar (or click the status bar item), describe your task, and watch it work!

## Supported Providers

Codin supports 14 different AI providers. Mark free tier paths with a ✦.

| Provider | Models (Examples) |
|---|---|
| **Claude (Anthropic)** | Claude 3.5 Sonnet, Opus, Haiku |
| **OpenAI** | GPT-4o, GPT-4o-mini |
| **Gemini** ✦ | Gemini 1.5 Pro, Flash |
| **Groq** ✦ | Llama 3 (ultra fast) |
| **OpenRouter** ✦ | Llama 3.1 8B (free), Meta, etc. |
| **Mistral** | Codestral |
| **DeepSeek** | DeepSeek Coder V2 |
| **Kimi** | Moonshot |
| **Qwen** | Qwen Max |
| **MiniMax** | abab6.5s |
| **Ollama** | Qwen2.5-Coder, DeepSeek-Coder, Llama 3 |
| **LM Studio** | Local models |
| **Jan** | Local models |
| **Custom** | Any OpenAI-compatible endpoint |

## How it works

1. **Connect your provider**: Use the onboarding wizard to securely store your API key or configure local execution.
2. **Describe what you want built**: Provide high-level instructions (e.g., "Refactor this component to use React Hooks").
3. **Review and approve**: Codin plans its approach, searches the necessary files, and presents inline diffs. Approve or reject each change!

## Configuration

For advanced settings, open the command palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) and type **Codin: Open Settings**.
Read more in our [Settings Documentation](docs/pages/settings.md).

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for details on how to set up the project locally, add new providers, and create PRs.

## License

MIT License. See [LICENSE](LICENSE) for details.
