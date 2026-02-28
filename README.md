# Claude Code Companion Dashboard

A local dashboard that runs alongside [Claude Code](https://claude.ai/claude-code), giving you a rich UI for browsing sessions, reviewing diffs, monitoring live activity, and analyzing usage — all powered by Claude Code's local data files in `~/.claude/`.

Runs as a **web app** (browser) or a **native desktop app** (Tauri v2).

## Features

| Feature | Description |
|---------|-------------|
| **Session Browser** | Browse all past sessions with conversation replay, collapsible thinking blocks, tool call details |
| **Bookmarks, Tags & Notes** | Bookmark sessions, add searchable tags, and write persistent notes per session |
| **Export** | Export any session as Markdown or JSON |
| **Diff Review** | Every Edit/Write operation as syntax-highlighted unified or side-by-side diff |
| **File Timeline** | Full edit history for any file across all sessions |
| **Live Monitor** | Watch the current Claude Code session stream in real-time via WebSocket |
| **Analytics** | Activity heatmap, token usage over time, cost estimates by model, tool timing |
| **Cost Budgets** | Set daily/weekly/monthly spend limits — alerts appear on the dashboard when exceeded |
| **Search** | Full-text search across all sessions (prompts, responses, tool calls) |
| **Command Palette** | `⌘K` to jump anywhere or search sessions |
| **Theme** | Dark / light mode toggle |
| **Desktop App** | Native macOS/Windows/Linux app via Tauri v2 with system tray |

## How it works

Claude Code stores all conversation data locally in `~/.claude/projects/<project>/<sessionId>.jsonl`. This dashboard reads those files directly — no API calls, no data leaves your machine.

```
~/.claude/
  history.jsonl              # Global prompt history
  projects/
    <project-hash>/
      <sessionId>.jsonl      # Full conversation logs (JSONL)
  dashboard-meta.json        # Bookmarks, tags, notes, budgets (written by this app)
```

## Tech Stack

| Layer | Tech |
|-------|------|
| Backend | Node.js, Express, WebSocket (`ws`), chokidar |
| Frontend | SvelteKit 5, Svelte 5, Tailwind CSS v4 |
| Desktop | Tauri v2 (Rust), system tray, minimize-to-tray |
| Diffs | diff2html, `diff` npm package |
| Syntax highlighting | Shiki |
| Markdown | marked + DOMPurify |
| Tests | Vitest (backend: node env, frontend: happy-dom) |

## Getting Started

### Prerequisites

- Node.js 18+
- Claude Code installed with at least one session recorded

### Web App

```bash
git clone https://github.com/mushyrocket/claude-dashboard.git
cd claude-dashboard
npm install
npm run dev
```

Open **http://localhost:5173** in your browser.

The backend API runs on port `3456`, the frontend dev server on `5173`. Vite proxies `/api` and `/ws` automatically in dev mode.

### Desktop App (Tauri)

Additional prerequisites: [Rust](https://rustup.rs/) + Xcode Command Line Tools (macOS).

```bash
npm run tauri:dev      # development
npm run tauri:build    # production bundle
```

The desktop app auto-starts the Node.js backend on launch and adds a system tray icon. Click the tray icon to show/hide the window; closing the window minimises to tray.

### Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start backend + frontend (web mode) |
| `npm run dev:backend` | Backend only (`tsx` watch) |
| `npm run dev:frontend` | Frontend only (Vite dev server) |
| `npm run build` | Production build |
| `npm run tauri:dev` | Desktop app in dev mode |
| `npm run tauri:build` | Package native desktop app |
| `npm test` | Run all unit tests |

## Project Structure

```
claude-dashboard/
  src/
    shared/
      types.ts            # TypeScript interfaces (backend + frontend)
      constants.ts        # ~/.claude paths, model pricing
    backend/
      server.ts           # Express + WebSocket server (port 3456)
      routes/             # sessions, diffs, stats, search, meta, files, live
      services/
        claude-data.ts      # Project/session discovery
        session-parser.ts   # JSONL → ProcessedMessage[]
        diff-extractor.ts   # Edit/Write → unified diffs
        stats-service.ts    # Usage aggregation + top files + tool timing
        session-meta.ts     # Bookmarks, tags, notes, budgets (dashboard-meta.json)
        search-index.ts     # Full-text search
        file-watcher.ts     # chokidar live session watching
        cache.ts            # LRU cache with mtime invalidation
      utils/
        jsonl-reader.ts     # Streaming JSONL reader
        cost-calculator.ts  # Token → USD conversion
        session-export.ts   # Session → Markdown / JSON
    lib/
      api/
        client.ts         # Typed fetch wrapper (auto-detects Tauri context)
        websocket.ts      # WebSocket client with auto-reconnect
      stores/
        meta.ts           # Bookmark/tag/note state
        theme.ts          # Dark/light theme with localStorage
      components/
        session/          # MessageCard, ToolCallCard, ThinkingBlock, BookmarkButton
        diff/             # DiffViewer (unified + split toggle)
        dashboard/        # ActivityHeatmap, TokenChart, ModelBreakdown
        shared/           # CommandPalette, BackendStatus, CodeBlock, Badge, …
    routes/
      +page.svelte                    # Dashboard (stats + budget alerts)
      sessions/+page.svelte           # Session list (filter, bookmark, tags)
      sessions/[id]/+page.svelte      # Session detail (replay, export, notes)
      diffs/+page.svelte              # All diffs
      diffs/[sessionId]/+page.svelte  # Per-session diffs
      analytics/+page.svelte          # Analytics + tool timing + budgets
      files/+page.svelte              # Top edited files
      files/timeline/+page.svelte     # Per-file edit history
      live/+page.svelte               # Live session monitor
      search/+page.svelte             # Full-text search
  src-tauri/                          # Tauri v2 Rust app
    src/lib.rs                        # System tray, backend spawn, window management
    tauri.conf.json                   # App config (1280×800, tray icon)
    Cargo.toml                        # tauri, tauri-plugin-shell, tauri-plugin-log
```

## API Reference

| Endpoint | Description |
|----------|-------------|
| `GET /api/projects` | List all Claude Code projects |
| `GET /api/sessions` | Paginated session list |
| `GET /api/sessions/:id` | Full session detail |
| `GET /api/sessions/:id/diffs` | File diffs for a session |
| `GET /api/sessions/:id/export?format=json\|markdown` | Export session |
| `GET /api/history` | Global prompt history |
| `GET /api/stats` | Aggregated usage stats |
| `GET /api/stats/top-files` | Most frequently edited files |
| `GET /api/stats/tool-usage` | Tool call frequency |
| `GET /api/stats/tool-timing` | Avg/max response time per tool |
| `GET /api/search?q=` | Full-text search |
| `GET /api/live/active` | Most recently active session ID |
| `GET /api/meta` | All session metadata (bookmarks, tags, notes) |
| `PUT /api/meta/:id` | Update session metadata |
| `GET /api/meta/budgets/current` | Cost budget thresholds |
| `PUT /api/meta/budgets/current` | Update budget thresholds |
| `GET /api/files/timeline?path=` | Edit history for a specific file |
| `WS  /ws` | WebSocket for live session streaming |

## Usage tip

Run in the background while you use Claude Code normally:

```bash
# Add to ~/.zshrc
alias dashboard='cd ~/code/claude-dashboard && npm run dev > /dev/null 2>&1 &'
```

Or open the desktop app (`npm run tauri:build`) so it lives in your system tray.

## License

MIT
