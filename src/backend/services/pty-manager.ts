import * as pty from 'node-pty';
import { existsSync } from 'fs';
import { EventEmitter } from 'events';
import { execSync } from 'child_process';
import { join } from 'path';
import chokidar from 'chokidar';
import { PROJECTS_DIR } from '../../shared/constants.js';
import { subscribeToSession } from './file-watcher.js';
import type { SubagentInfo, RawSessionEntry, ContentBlock } from '../../shared/types.js';

/** Convert a project path to the Claude hash format (e.g. /Users/myu/code/foo → -Users-myu-code-foo) */
export function pathToHash(projectPath: string): string {
  return projectPath.replace(/[/.]/g, '-');
}

export interface PtySession {
  id: string;
  pty: pty.IPty;
  projectPath: string;
  model?: string;
  status: 'starting' | 'active' | 'ended';
  createdAt: Date;
  jsonlPath?: string;
  jsonlCleanup?: () => void;
}

export class PtyManager extends EventEmitter {
  private sessions = new Map<string, PtySession>();
  /** Track known Agent tool_use IDs per PTY session */
  private agentToolUseIds = new Map<string, Set<string>>();
  /** Track background agent file watchers (toolUseId → cleanup) */
  private bgAgentWatchers = new Map<string, () => void>();

  /** Find the claude binary, throw if not installed */
  static findClaude(): string {
    // Try `which` first — respects the user's actual PATH
    try {
      const found = execSync('which claude', { encoding: 'utf8', env: process.env }).trim();
      if (found) return found;
    } catch {}

    // Fallback: check common install locations
    const candidates = [
      `${process.env.HOME}/.local/bin/claude`,
      '/opt/homebrew/bin/claude',
      '/usr/local/bin/claude',
      '/usr/bin/claude',
    ];
    for (const c of candidates) {
      if (existsSync(c)) return c;
    }

    throw new Error(
      'claude CLI not found. Install Claude Code: https://claude.ai/download'
    );
  }

  createSession(options: {
    id: string;
    projectPath: string;
    model?: string;
    resumeSessionId?: string;
    permissionMode?: string;
    cols?: number;
    rows?: number;
  }): PtySession {
    const claudeBin = PtyManager.findClaude();

    // Interactive mode — no --print, no --output-format, no --input-format
    const args: string[] = [];
    if (options.model) args.push('--model', options.model);
    if (options.resumeSessionId) args.push('--resume', options.resumeSessionId);
    if (options.permissionMode) args.push('--permission-mode', options.permissionMode);

    // Strip CLAUDECODE so nested sessions are allowed; enable color output
    const { CLAUDECODE: _omit, NO_COLOR: _nc, ...cleanEnv } = process.env as Record<string, string | undefined>;

    const ptyProcess = pty.spawn(claudeBin, args, {
      name: 'xterm-256color',
      cols: options.cols ?? 80,
      rows: options.rows ?? 24,
      cwd: options.projectPath,
      env: { ...cleanEnv, TERM: 'xterm-256color' } as Record<string, string>,
    });

    const session: PtySession = {
      id: options.id,
      pty: ptyProcess,
      projectPath: options.projectPath,
      model: options.model,
      status: 'active',
      createdAt: new Date(),
    };

    this.sessions.set(options.id, session);

    ptyProcess.onData((data: string) => {
      this.emit('pty-output', options.id, data);
    });

    ptyProcess.onExit(({ exitCode }) => {
      session.status = 'ended';
      this.cleanupJsonlWatcher(options.id);
      this.sessions.delete(options.id);
      this.emit('session-end', options.id, exitCode ?? 1);
    });

    return session;
  }

  /**
   * Watch for a new JSONL session file in the project's Claude directory.
   * Once found, subscribe to it and parse entries for subagent events.
   */
  watchSessionJsonl(ptySessionId: string, projectPath: string): void {
    const session = this.sessions.get(ptySessionId);
    if (!session) return;

    const projectHash = pathToHash(projectPath);
    const projectDir = join(PROJECTS_DIR, projectHash);

    if (!existsSync(projectDir)) {
      console.log(`[PtyManager] Project dir not found: ${projectDir}`);
      return;
    }

    this.agentToolUseIds.set(ptySessionId, new Set());

    // Watch for new .jsonl files in this project directory
    const dirWatcher = chokidar.watch(projectDir, {
      ignoreInitial: true,
      depth: 0,
    });

    const createdAt = Date.now();
    let foundFile = false;

    const handleNewFile = async (filePath: string) => {
      // Only watch .jsonl files created within 30s of session start
      if (foundFile) return;
      if (!filePath.endsWith('.jsonl')) return;
      if (filePath.includes('agent-')) return; // skip subagent files
      if (Date.now() - createdAt > 30_000) {
        dirWatcher.close();
        return;
      }

      foundFile = true;
      dirWatcher.close();

      session.jsonlPath = filePath;
      console.log(`[PtyManager] Found session JSONL: ${filePath}`);

      // Subscribe to the JSONL file for new entries
      const unsubscribe = await subscribeToSession(filePath, (entries) => {
        this.processJsonlEntries(ptySessionId, entries);
      });

      session.jsonlCleanup = unsubscribe;
    };

    dirWatcher.on('add', handleNewFile);
    dirWatcher.on('change', (filePath: string) => {
      // Also check changed files — the file might already exist but just got its first write
      if (!foundFile && filePath.endsWith('.jsonl') && !filePath.includes('agent-')) {
        handleNewFile(filePath);
      }
    });

    // Timeout: stop watching after 30s
    setTimeout(() => {
      if (!foundFile) {
        dirWatcher.close();
        console.log(`[PtyManager] Timed out waiting for JSONL file for ${ptySessionId}`);
      }
    }, 30_000);
  }

  /** Process JSONL entries looking for subagent lifecycle events */
  private processJsonlEntries(ptySessionId: string, entries: RawSessionEntry[]): void {
    const knownIds = this.agentToolUseIds.get(ptySessionId);
    if (!knownIds) return;

    for (const entry of entries) {
      // Check assistant messages for Agent tool_use blocks
      if (entry.type === 'assistant' && entry.message && typeof entry.message === 'object' && 'role' in entry.message && entry.message.role === 'assistant') {
        const content = (entry.message as { content: ContentBlock[] }).content;
        if (!Array.isArray(content)) continue;

        for (const block of content) {
          if (block.type === 'tool_use' && block.name === 'Agent' && block.id && block.input) {
            const input = block.input as Record<string, unknown>;
            const agent: SubagentInfo = {
              toolUseId: block.id,
              description: (input.description as string) || 'Agent',
              subagentType: (input.subagent_type as string) || 'general-purpose',
              isBackground: !!(input.run_in_background),
              status: 'running',
              startedAt: entry.timestamp || new Date().toISOString(),
            };

            knownIds.add(block.id);
            this.emit('subagent-started', ptySessionId, agent);

            // Start tailing background agent output
            if (agent.isBackground) {
              const session = this.sessions.get(ptySessionId);
              if (session) {
                this.watchBackgroundAgent(ptySessionId, block.id, session.projectPath);
              }
            }
          }
        }
      }

      // Check user messages for tool_result blocks matching known Agent tool_use IDs
      if (entry.type === 'user' && entry.message && typeof entry.message === 'object' && 'role' in entry.message && entry.message.role === 'user') {
        const content = (entry.message as { content: string | ContentBlock[] }).content;
        if (!Array.isArray(content)) continue;

        for (const block of content) {
          if (block.type === 'tool_result' && block.tool_use_id && knownIds.has(block.tool_use_id)) {
            let resultText = '';
            if (typeof block.content === 'string') {
              resultText = block.content;
            } else if (Array.isArray(block.content)) {
              resultText = block.content
                .filter((b: ContentBlock) => b.type === 'text' && b.text)
                .map((b: ContentBlock) => b.text)
                .join('\n');
            }

            const summary = resultText.slice(0, 500);
            this.emit('subagent-completed', ptySessionId, block.tool_use_id, summary);

            // Clean up background agent watcher
            const bgCleanup = this.bgAgentWatchers.get(block.tool_use_id);
            if (bgCleanup) {
              bgCleanup();
              this.bgAgentWatchers.delete(block.tool_use_id);
            }
          }
        }
      }
    }
  }

  /**
   * Start tailing a background agent's JSONL file for live output streaming.
   * Background agents write to agent-<uuid>.jsonl in the same project directory.
   */
  private watchBackgroundAgent(ptySessionId: string, toolUseId: string, projectPath: string): void {
    const projectHash = pathToHash(projectPath);
    const projectDir = join(PROJECTS_DIR, projectHash);

    // Watch for new agent-*.jsonl files appearing in the project dir
    const watcher = chokidar.watch(projectDir, {
      ignoreInitial: false,
      depth: 0,
    });

    let foundFile = false;
    const startTime = Date.now();

    const trySubscribe = async (filePath: string) => {
      if (foundFile) return;
      if (!filePath.endsWith('.jsonl')) return;
      // Agent files have 'agent-' prefix OR are new files created after the agent started
      const filename = filePath.split('/').pop() || '';
      if (!filename.startsWith('agent-')) return;

      // Check if this file was created recently (within a few seconds of agent start)
      try {
        const { stat } = await import('fs/promises');
        const s = await stat(filePath);
        if (s.mtimeMs < startTime - 2000) return; // older file, skip
      } catch { return; }

      foundFile = true;
      watcher.close();

      console.log(`[PtyManager] Tailing background agent output: ${filePath}`);

      const unsubscribe = await subscribeToSession(filePath, (entries) => {
        for (const entry of entries) {
          // Extract text from assistant messages
          if (entry.type === 'assistant' && entry.message && typeof entry.message === 'object' && 'role' in entry.message) {
            const content = (entry.message as { content: ContentBlock[] }).content;
            if (!Array.isArray(content)) continue;
            for (const block of content) {
              if (block.type === 'text' && block.text) {
                this.emit('subagent-output', ptySessionId, toolUseId, block.text);
              }
            }
          }
          // Also extract tool_use summaries (tool name + brief input)
          if (entry.type === 'assistant' && entry.message && typeof entry.message === 'object' && 'role' in entry.message) {
            const content = (entry.message as { content: ContentBlock[] }).content;
            if (!Array.isArray(content)) continue;
            for (const block of content) {
              if (block.type === 'tool_use' && block.name) {
                const inputSummary = block.input ? JSON.stringify(block.input).slice(0, 200) : '';
                this.emit('subagent-output', ptySessionId, toolUseId, `[Tool: ${block.name}] ${inputSummary}\n`);
              }
            }
          }
        }
      });

      this.bgAgentWatchers.set(toolUseId, unsubscribe);
    };

    watcher.on('add', trySubscribe);
    watcher.on('change', trySubscribe);

    // Timeout after 30s
    setTimeout(() => {
      if (!foundFile) {
        watcher.close();
      }
    }, 30_000);

    // Store watcher cleanup in case we need to clean up early
    if (!foundFile) {
      this.bgAgentWatchers.set(toolUseId, () => {
        watcher.close();
      });
    }
  }

  private cleanupJsonlWatcher(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session?.jsonlCleanup) {
      session.jsonlCleanup();
      session.jsonlCleanup = undefined;
    }
    // Clean up all background agent watchers for this session
    const knownIds = this.agentToolUseIds.get(sessionId);
    if (knownIds) {
      for (const toolUseId of knownIds) {
        const bgCleanup = this.bgAgentWatchers.get(toolUseId);
        if (bgCleanup) {
          bgCleanup();
          this.bgAgentWatchers.delete(toolUseId);
        }
      }
    }
    this.agentToolUseIds.delete(sessionId);
  }

  sendInput(sessionId: string, data: string): void {
    const session = this.sessions.get(sessionId);
    if (!session || session.status === 'ended') return;
    session.pty.write(data);
  }

  resize(sessionId: string, cols: number, rows: number): void {
    const session = this.sessions.get(sessionId);
    if (!session || session.status === 'ended') return;
    session.pty.resize(cols, rows);
  }

  killSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    this.cleanupJsonlWatcher(sessionId);
    try {
      session.pty.kill();
    } catch {}
    session.status = 'ended';
    this.sessions.delete(sessionId);
  }

  getSession(sessionId: string): PtySession | undefined {
    return this.sessions.get(sessionId);
  }

  listSessions(): PtySession[] {
    return Array.from(this.sessions.values());
  }
}
