import { randomUUID } from 'crypto';
import { PtyManager } from './pty-manager.js';
import { ProtocolParser } from './protocol-parser.js';
import type {
  StreamEvent,
  ChatCreatedMsg,
  ChatEventMsg,
  PtyOutputMsg,
  ToolApprovalReqMsg,
  ChatSessionEndMsg,
} from '../../shared/types.js';

type OutboundMsg =
  | ChatCreatedMsg
  | ChatEventMsg
  | PtyOutputMsg
  | ToolApprovalReqMsg
  | ChatSessionEndMsg;

interface ActiveChat {
  parser: ProtocolParser;
  status: 'starting' | 'active' | 'waiting_approval' | 'ended';
  pendingApproval?: { toolId: string; toolName: string; input: Record<string, unknown> };
}

export class SessionManager {
  private ptyManager = new PtyManager();
  private chats = new Map<string, ActiveChat>();
  private notify: (sessionId: string, msg: OutboundMsg) => void;

  constructor(notify: (sessionId: string, msg: OutboundMsg) => void) {
    this.notify = notify;
    this.wirePtyEvents();
  }

  private wirePtyEvents() {
    this.ptyManager.on('pty-output', (sessionId: string, data: string) => {
      // Forward raw output to terminal panel
      this.notify(sessionId, { type: 'pty-output', sessionId, data });

      // Also parse for structured events
      const chat = this.chats.get(sessionId);
      if (!chat) return;

      const events = chat.parser.feed(data);
      for (const event of events) {
        this.handleEvent(sessionId, chat, event);
      }
    });

    this.ptyManager.on('session-end', (sessionId: string, exitCode: number) => {
      const chat = this.chats.get(sessionId);
      if (chat) {
        // Flush any remaining buffered data
        const events = chat.parser.flush();
        for (const event of events) {
          this.handleEvent(sessionId, chat, event);
        }
        chat.status = 'ended';
        this.chats.delete(sessionId);
      }
      this.notify(sessionId, { type: 'session-end', sessionId, exitCode });
    });
  }

  private handleEvent(sessionId: string, chat: ActiveChat, event: StreamEvent) {
    // Forward structured event to frontend
    this.notify(sessionId, { type: 'chat-event', sessionId, event });

    // Track state transitions
    if (event.type === 'system' && 'subtype' in event && event.subtype === 'init') {
      chat.status = 'active';
      const ptySession = this.ptyManager.getSession(sessionId);
      if (ptySession) ptySession.claudeSessionId = event.session_id;
    }

    if (event.type === 'tool' && 'subtype' in event && event.subtype === 'approval_request') {
      chat.status = 'waiting_approval';
      const e = event as Extract<typeof event, { subtype: 'approval_request' }>;
      chat.pendingApproval = {
        toolId: e.tool_id,
        toolName: e.tool_name,
        input: e.input,
      };
      this.notify(sessionId, {
        type: 'tool-approval-request',
        sessionId,
        toolId: e.tool_id,
        toolName: e.tool_name,
        input: e.input,
      });
    }

    if (event.type === 'result') {
      chat.status = 'active';
      chat.pendingApproval = undefined;
    }
  }

  createSession(options: {
    projectPath: string;
    model?: string;
    resumeSessionId?: string;
    permissionMode?: string;
  }): string {
    const sessionId = randomUUID();
    const chat: ActiveChat = {
      parser: new ProtocolParser(),
      status: 'starting',
    };
    this.chats.set(sessionId, chat);

    this.ptyManager.createSession({ id: sessionId, ...options });
    return sessionId;
  }

  sendMessage(sessionId: string, text: string): void {
    const chat = this.chats.get(sessionId);
    if (!chat || chat.status === 'ended') return;
    const payload = JSON.stringify({ type: 'user', message: { role: 'user', content: text } }) + '\n';
    this.ptyManager.sendInput(sessionId, payload);
  }

  approveToolUse(sessionId: string, toolId: string, approved: boolean): void {
    const chat = this.chats.get(sessionId);
    if (!chat) return;
    const payload = JSON.stringify({ type: 'tool_result', tool_use_id: toolId, approved }) + '\n';
    this.ptyManager.sendInput(sessionId, payload);
    chat.status = 'active';
    chat.pendingApproval = undefined;
  }

  endSession(sessionId: string): void {
    this.ptyManager.killSession(sessionId);
    this.chats.delete(sessionId);
  }

  listSessions() {
    return this.ptyManager.listSessions().map((s) => ({
      id: s.id,
      projectPath: s.projectPath,
      model: s.model,
      status: this.chats.get(s.id)?.status ?? s.status,
      createdAt: s.createdAt,
    }));
  }
}
