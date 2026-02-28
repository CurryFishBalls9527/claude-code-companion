import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import { existsSync } from 'fs';
import { EventEmitter } from 'events';
import { execSync } from 'child_process';

export interface ChatSession {
  id: string;
  process: ChildProcessWithoutNullStreams;
  projectPath: string;
  model?: string;
  claudeSessionId?: string;
  status: 'starting' | 'ready' | 'busy' | 'ended';
  createdAt: Date;
}

export class PtyManager extends EventEmitter {
  private sessions = new Map<string, ChatSession>();

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
  }): ChatSession {
    const claudeBin = PtyManager.findClaude();

    const args = [
      '--print',
      '--output-format', 'stream-json',
      '--input-format', 'stream-json',
      '--verbose',
    ];
    if (options.model) args.push('--model', options.model);
    if (options.resumeSessionId) args.push('--resume', options.resumeSessionId);
    if (options.permissionMode) args.push('--permission-mode', options.permissionMode);

    // Strip CLAUDECODE so nested sessions are allowed
    const { CLAUDECODE: _omit, ...cleanEnv } = process.env as Record<string, string | undefined>;
    const childProcess = spawn(claudeBin, args, {
      cwd: options.projectPath,
      env: { ...cleanEnv, FORCE_COLOR: '0', NO_COLOR: '1', TERM: 'dumb' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const session: ChatSession = {
      id: options.id,
      process: childProcess,
      projectPath: options.projectPath,
      model: options.model,
      status: 'starting',
      createdAt: new Date(),
    };

    this.sessions.set(options.id, session);

    childProcess.stdout.on('data', (chunk: Buffer) => {
      this.emit('pty-output', options.id, chunk.toString('utf8'));
    });

    childProcess.stderr.on('data', (chunk: Buffer) => {
      this.emit('pty-output', options.id, chunk.toString('utf8'));
    });

    childProcess.on('exit', (code) => {
      session.status = 'ended';
      this.sessions.delete(options.id);
      this.emit('session-end', options.id, code ?? 1);
    });

    return session;
  }

  sendInput(sessionId: string, text: string): void {
    const session = this.sessions.get(sessionId);
    if (!session || session.status === 'ended') return;
    session.process.stdin.write(text, 'utf8');
  }

  killSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    try {
      session.process.kill('SIGTERM');
    } catch {}
    session.status = 'ended';
    this.sessions.delete(sessionId);
  }

  getSession(sessionId: string): ChatSession | undefined {
    return this.sessions.get(sessionId);
  }

  listSessions(): ChatSession[] {
    return Array.from(this.sessions.values());
  }
}
