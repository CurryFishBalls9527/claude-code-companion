import * as pty from 'node-pty';
import { EventEmitter } from 'events';
import { execSync } from 'child_process';

export interface ChatSession {
  id: string;
  ptyProcess: pty.IPty;
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
    const candidates = [
      '/opt/homebrew/bin/claude',
      '/usr/local/bin/claude',
      '/usr/bin/claude',
    ];
    for (const c of candidates) {
      try {
        if (require('fs').existsSync(c)) return c;
      } catch {}
    }
    try {
      return execSync('which claude', { encoding: 'utf8' }).trim();
    } catch {
      throw new Error(
        'claude CLI not found. Install Claude Code: https://claude.ai/download'
      );
    }
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

    const ptyProcess = pty.spawn(claudeBin, args, {
      name: 'xterm-256color',
      cols: 220,
      rows: 50,
      cwd: options.projectPath,
      env: {
        ...process.env,
        FORCE_COLOR: '0',
        NO_COLOR: '1',
        TERM: 'dumb',
      },
    });

    const session: ChatSession = {
      id: options.id,
      ptyProcess,
      projectPath: options.projectPath,
      model: options.model,
      status: 'starting',
      createdAt: new Date(),
    };

    this.sessions.set(options.id, session);

    ptyProcess.onData((data: string) => {
      this.emit('pty-output', options.id, data);
    });

    ptyProcess.onExit(({ exitCode }: { exitCode: number }) => {
      session.status = 'ended';
      this.sessions.delete(options.id);
      this.emit('session-end', options.id, exitCode);
    });

    return session;
  }

  sendInput(sessionId: string, text: string): void {
    const session = this.sessions.get(sessionId);
    if (!session || session.status === 'ended') return;
    session.ptyProcess.write(text);
  }

  killSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    try {
      session.ptyProcess.kill();
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
