# Claude Code Companion Dashboard

A local web dashboard that runs alongside [Claude Code](https://claude.ai/claude-code), giving you a rich UI for browsing sessions, reviewing file diffs, monitoring live activity, and analyzing usage stats — all powered by Claude Code's local data files in `~/.claude/`.

![Dashboard Screenshot](static/screenshot-placeholder.png)

## Features

- **Session Browser** — Browse all past Claude Code sessions with full conversation replay, collapsible thinking blocks, and expandable tool call details
- **Diff Review** — See every file Edit and Write operation as a syntax-highlighted unified or side-by-side diff
- **Live Monitor** — Watch the current Claude Code session stream in real-time via WebSocket
- **Usage Analytics** — Activity heatmap, token usage over time, cost estimates, model breakdown
- **Search** — Full-text search across all sessions (prompts, responses, tool calls)
- **Dashboard** — Stats overview with 52-week activity heatmap and per-model cost tracking

## How it works

Claude Code stores all conversation data locally in `~/.claude/projects/<project>/<sessionId>.jsonl`. This dashboard reads those files directly — no API calls, no data leaves your machine.

```
~/.claude/
  history.jsonl              # Global prompt history
  projects/
    <project-hash>/
      <sessionId>.jsonl      # Full conversation logs (JSONL)
```

## Tech Stack

| Layer | Tech |
|-------|------|
| Backend | Node.js, Express, WebSocket (`ws`), chokidar |
| Frontend | SvelteKit 5, Svelte 5, Tailwind CSS v4 |
| Diffs | diff2html, `diff` npm package |
| Charts | Chart.js |
| Syntax highlighting | Shiki (`github-dark` theme) |
| Markdown | marked + DOMPurify |

## Getting Started

### Prerequisites

- Node.js 18+
- Claude Code installed and at least one session recorded

### Install & Run

```bash
git clone https://github.com/your-username/claude-dashboard.git
cd claude-dashboard
npm install
npm run dev
```

Then open **http://localhost:5173** in your browser.

The backend API runs on port `3456`, the frontend on `5173`. Vite proxies `/api` and `/ws` automatically during development.

### Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start both backend + frontend in development mode |
| `npm run dev:backend` | Backend only (tsx watch) |
| `npm run dev:frontend` | Frontend only (Vite dev server) |
| `npm run build` | Production build |

## Project Structure

```
claude-dashboard/
  src/
    shared/
      types.ts          # TypeScript interfaces shared between BE and FE
      constants.ts      # ~/.claude paths, model pricing
    backend/
      server.ts         # Express + WebSocket server (port 3456)
      routes/           # API route handlers
      services/
        claude-data.ts      # Discovers projects/sessions
        session-parser.ts   # JSONL → ProcessedMessage[]
        diff-extractor.ts   # Edit/Write tool calls → unified diffs
        stats-service.ts    # Aggregates usage stats
        search-index.ts     # Full-text search
        file-watcher.ts     # chokidar live session watching
        cache.ts            # LRU cache for parsed sessions
      utils/
        jsonl-reader.ts     # Streaming JSONL reader + tail for live mode
        cost-calculator.ts  # Token → USD cost conversion
    lib/                # SvelteKit frontend
      api/
        client.ts       # Typed fetch wrapper (swap point for Tauri)
        websocket.ts    # WebSocket client with auto-reconnect
      stores/           # Svelte stores
      components/
        session/        # MessageCard, ToolCallCard, ThinkingBlock
        diff/           # DiffViewer
        dashboard/      # ActivityHeatmap, TokenChart, ModelBreakdown
        shared/         # CodeBlock (Shiki), MarkdownRenderer, Badge, etc.
    routes/             # SvelteKit pages
      +page.svelte               # Dashboard home
      sessions/+page.svelte      # Session list
      sessions/[id]/+page.svelte # Session detail + replay
      diffs/+page.svelte         # Diff list
      diffs/[sessionId]/+page.svelte # Per-session diffs
      analytics/+page.svelte     # Usage analytics
      live/+page.svelte          # Live session monitor
      search/+page.svelte        # Search results
```

## API Reference

| Endpoint | Description |
|----------|-------------|
| `GET /api/projects` | List all Claude Code projects |
| `GET /api/sessions` | Paginated session list (filter by project, sort by date/tokens/messages) |
| `GET /api/sessions/:id` | Full session detail with all messages |
| `GET /api/sessions/:id/diffs` | File diffs extracted from Edit/Write tool calls |
| `GET /api/history` | Global prompt history from `history.jsonl` |
| `GET /api/stats` | Aggregated usage stats |
| `GET /api/stats/top-files` | Most frequently edited files |
| `GET /api/stats/tool-usage` | Tool call frequency breakdown |
| `GET /api/search?q=` | Full-text search across all sessions |
| `GET /api/live/active` | Most recently active session ID |
| `WS /ws` | WebSocket for live session streaming |

## Usage alongside Claude Code

Run the dashboard in the background while you use Claude Code normally:

```bash
# Add to ~/.zshrc for convenience
alias dashboard='cd ~/path/to/claude-dashboard && npm run dev &'
```

Or use iTerm2's split pane (`Cmd+D`) to keep the browser open alongside your terminal.

### Live Monitor

The `/live` page auto-detects the most recently modified session file and streams new messages via WebSocket as Claude responds. Refresh the page to pick up a new session.

## Roadmap

- [ ] **v2: Native desktop app** — Tauri migration (frontend is already adapter-static, ready to embed)
- [ ] **Top files** — Full per-file edit history across sessions
- [ ] **Session comparison** — Diff two sessions side by side
- [ ] **Cost alerts** — Notify when daily spend exceeds a threshold
- [ ] **Export** — Export sessions as Markdown or JSON

## V2 Desktop Migration

The architecture is designed for a clean migration to a native app:

1. **Frontend is portable** — `adapter-static` produces pure static files embeddable in Tauri/Electron
2. **Single API swap point** — `src/lib/api/client.ts` replaces `fetch()` with `invoke()` from `@tauri-apps/api`
3. **WebSocket → Tauri events** — `src/lib/api/websocket.ts` swaps to `@tauri-apps/api/event`
4. **Backend → Rust** — Node.js services map 1:1 to Rust modules (session_parser, file_watcher with `notify` crate, etc.)

## License

MIT
