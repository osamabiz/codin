# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] — first release

### Added
- AI coding agent loop with plan → execute → verify cycle
- 10 built-in tools: read/write/create/delete file, run command, grep codebase, list files, git status, git commit, open browser
- 14 LLM providers: Claude, OpenAI, Gemini, Groq (free), OpenRouter (free models), Mistral, DeepSeek, Kimi, Qwen, MiniMax, Ollama, LM Studio, Jan, Custom
- Onboarding wizard with free tier paths
- Inline diff view with approve/reject for every file edit
- Dry run mode
- Task planning visible in sidebar
- Conversation history per project
- Full test suite: unit, integration, E2E with mock LLM
