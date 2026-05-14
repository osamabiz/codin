# Phase 0 — Project setup & scaffolding

**Duration:** Week 1  
**Goal:** A working VS Code extension that installs, activates, and shows a placeholder chat panel. Nothing functional yet — just the skeleton with all tooling in place.

---

## Deliverables

- [ ] VS Code extension that installs from source (`F5` debug works)
- [ ] Webview panel opens on command `Agent: Open Chat`
- [ ] Activity bar sidebar icon and placeholder view
- [ ] TypeScript, ESLint, Prettier, Vitest all configured
- [ ] GitHub Actions CI (lint + test on every push)
- [ ] `README.md`, `LICENSE` (MIT), `CONTRIBUTING.md`
- [ ] `.agent/AGENT.md` with instructions for coding agents
- [ ] All spec files from `docs/` committed to repo

---

## Coding agent prompt

Use this prompt with Claude Code (or any agent) to scaffold the project:

```
Read docs/overview.md and docs/architecture.md first.

Then scaffold a VS Code extension with:
- TypeScript + strict mode
- A webview panel command "Agent: Open Chat" (command id: agentPlugin.openChat)
- An activity bar view container with a tree view (view id: agentPlugin.sidebar)
- Vitest for unit tests with a sample passing test
- ESLint + Prettier configured
- GitHub Actions workflow: .github/workflows/ci.yml — runs "npm run lint" and "npm test" on push/PR to main
- package.json with name "vscode-agent", publisher "open-source", display name "AI Coding Agent"

The webview panel should show a placeholder: "Chat panel — coming in Phase 1"
The sidebar should show a placeholder item: "No active task"

Do not implement any LLM logic. This is scaffold only.
```

---

## File structure after Phase 0

```
vscode-agent/
├── .agent/
│   └── AGENT.md
├── .github/
│   └── workflows/
│       └── ci.yml
├── docs/                    ← all spec files live here
├── src/
│   ├── extension.ts         ← activate() and deactivate()
│   ├── ui/
│   │   ├── ChatPanel.ts     ← webview panel wrapper
│   │   └── SidebarProvider.ts
│   └── utils/
│       └── logger.ts
├── webview-ui/
│   ├── index.html
│   ├── main.ts
│   └── style.css
├── test/
│   └── extension.test.ts    ← sample test
├── .eslintrc.json
├── .prettierrc
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── CONTRIBUTING.md
├── LICENSE
└── README.md
```

---

## Key `package.json` contributions

```json
{
  "contributes": {
    "commands": [
      { "command": "agentPlugin.openChat", "title": "Agent: Open Chat" }
    ],
    "viewsContainers": {
      "activitybar": [
        { "id": "agentPlugin", "title": "AI Agent", "icon": "$(robot)" }
      ]
    },
    "views": {
      "agentPlugin": [
        { "id": "agentPlugin.sidebar", "name": "Agent" }
      ]
    },
    "keybindings": [
      {
        "command": "agentPlugin.openChat",
        "key": "ctrl+shift+a",
        "mac": "cmd+shift+a"
      }
    ]
  }
}
```

---

## Definition of done

- `npm run lint` passes with zero warnings
- `npm test` passes
- `F5` in VS Code opens Extension Development Host
- `Ctrl+Shift+A` opens the placeholder chat panel
- Agent icon appears in activity bar
- GitHub Actions CI is green on first push
