import type {
  WsServerMessage,
  RawSessionEntry,
  StreamEvent,
  ChatCreatedMsg,
  ChatEventMsg,
  PtyOutputMsg,
  PtyCreatedMsg,
  PtyEndedMsg,
  ToolApprovalReqMsg,
  ChatSessionEndMsg,
  SubagentInfo,
  SubagentStartedMsg,
  SubagentCompletedMsg,
} from '$shared/types.js';

type UpdateCallback = (entries: RawSessionEntry[]) => void;
type ChatEventCallback = (sessionId: string, event: StreamEvent) => void;
type PtyOutputCallback = (sessionId: string, data: string) => void;
type ToolApprovalCallback = (msg: ToolApprovalReqMsg) => void;
type ChatEndCallback = (sessionId: string, exitCode: number) => void;
type ChatCreatedCallback = (sessionId: string) => void;
type PtyCreatedCallback = (sessionId: string) => void;
type PtyEndedCallback = (sessionId: string, exitCode: number) => void;
type SubagentStartedCallback = (ptySessionId: string, agent: SubagentInfo) => void;
type SubagentCompletedCallback = (ptySessionId: string, toolUseId: string, resultSummary: string) => void;
type SubagentOutputCallback = (ptySessionId: string, toolUseId: string, data: string) => void;

export class LiveSessionClient {
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = 1000;
  private maxDelay = 30000;
  private subscribers = new Map<string, UpdateCallback[]>();
  private url: string;
  private destroyed = false;

  // Chat event callbacks
  private chatEventCbs: ChatEventCallback[] = [];
  private ptyOutputCbs: PtyOutputCallback[] = [];
  private toolApprovalCbs: ToolApprovalCallback[] = [];
  private chatEndCbs: ChatEndCallback[] = [];
  private chatCreatedCbs: ChatCreatedCallback[] = [];
  private ptyCreatedCbs: PtyCreatedCallback[] = [];
  private ptyEndedCbs: PtyEndedCallback[] = [];
  private errorCbs: ((message: string) => void)[] = [];
  private subagentStartedCbs: SubagentStartedCallback[] = [];
  private subagentCompletedCbs: SubagentCompletedCallback[] = [];
  private subagentOutputCbs: SubagentOutputCallback[] = [];

  constructor(url?: string) {
    const isTauri = typeof window !== 'undefined' && '__TAURI__' in window;
    this.url = url ?? (isTauri ? 'ws://localhost:3456/ws' : `ws://${window.location.host}/ws`);
  }

  connect(): void {
    if (this.destroyed) return;
    if (this.ws?.readyState === WebSocket.OPEN) return;

    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      console.log('[WS] Connected');
      this.reconnectDelay = 1000;
      for (const sessionId of this.subscribers.keys()) {
        this.send({ type: 'subscribe', sessionId });
      }
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string);

        // ── Live replay messages ──
        if (msg.type === 'session-update') {
          const m = msg as WsServerMessage;
          const cbs = this.subscribers.get(m.sessionId) ?? [];
          for (const cb of cbs) cb(m.entries);
          return;
        }

        // ── Chat messages ──
        if (msg.type === 'chat-created') {
          const m = msg as ChatCreatedMsg;
          for (const cb of this.chatCreatedCbs) cb(m.sessionId);
        }
        if (msg.type === 'chat-event') {
          const m = msg as ChatEventMsg;
          for (const cb of this.chatEventCbs) cb(m.sessionId, m.event);
        }
        if (msg.type === 'pty-output') {
          const m = msg as PtyOutputMsg;
          for (const cb of this.ptyOutputCbs) cb(m.sessionId, m.data);
        }
        if (msg.type === 'tool-approval-request') {
          const m = msg as ToolApprovalReqMsg;
          for (const cb of this.toolApprovalCbs) cb(m);
        }
        if (msg.type === 'session-end') {
          const m = msg as ChatSessionEndMsg;
          for (const cb of this.chatEndCbs) cb(m.sessionId, m.exitCode);
        }
        if (msg.type === 'pty-created') {
          const m = msg as PtyCreatedMsg;
          for (const cb of this.ptyCreatedCbs) cb(m.sessionId);
        }
        if (msg.type === 'pty-ended') {
          const m = msg as PtyEndedMsg;
          for (const cb of this.ptyEndedCbs) cb(m.sessionId, m.exitCode);
        }
        if (msg.type === 'subagent-started') {
          const m = msg as SubagentStartedMsg;
          for (const cb of this.subagentStartedCbs) cb(m.ptySessionId, m.agent);
        }
        if (msg.type === 'subagent-completed') {
          const m = msg as SubagentCompletedMsg;
          for (const cb of this.subagentCompletedCbs) cb(m.ptySessionId, m.toolUseId, m.resultSummary);
        }
        if (msg.type === 'subagent-output') {
          for (const cb of this.subagentOutputCbs) cb(msg.ptySessionId, msg.toolUseId, msg.data);
        }
        if (msg.type === 'error') {
          for (const cb of this.errorCbs) cb(msg.message ?? 'Unknown error');
        }
      } catch {
        // Ignore parse errors
      }
    };

    this.ws.onclose = () => {
      console.log('[WS] Disconnected, reconnecting in', this.reconnectDelay, 'ms');
      if (!this.destroyed) {
        this.reconnectTimer = setTimeout(() => {
          this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxDelay);
          this.connect();
        }, this.reconnectDelay);
      }
    };

    this.ws.onerror = (err) => {
      console.error('[WS] Error:', err);
      this.ws?.close();
    };
  }

  // ── Live replay ──────────────────────────────────────────────────────────────
  subscribe(sessionId: string, callback: UpdateCallback): () => void {
    if (!this.subscribers.has(sessionId)) this.subscribers.set(sessionId, []);
    this.subscribers.get(sessionId)!.push(callback);
    this.send({ type: 'subscribe', sessionId });
    return () => {
      const cbs = this.subscribers.get(sessionId) ?? [];
      const idx = cbs.indexOf(callback);
      if (idx >= 0) cbs.splice(idx, 1);
      if (cbs.length === 0) this.subscribers.delete(sessionId);
    };
  }

  // ── Chat session controls ────────────────────────────────────────────────────
  createChatSession(options: {
    projectPath: string;
    model?: string;
    resumeSessionId?: string;
    permissionMode?: string;
    effort?: string;
    thinking?: { type: string; budgetTokens?: number };
    maxTurns?: number;
    maxBudgetUsd?: number;
    appendSystemPrompt?: string;
    allowedTools?: string[];
    disallowedTools?: string[];
    customAgents?: Record<string, { description: string }>;
    mcpServers?: Record<string, { type: string; command?: string; args?: string[]; url?: string; env?: Record<string, string> }>;
    enableFileCheckpointing?: boolean;
  }): void {
    this.send({ type: 'chat-create', ...options });
  }

  updateSessionSettings(sessionId: string, settings: { permissionMode?: string; model?: string }): void {
    this.send({ type: 'chat-settings', sessionId, ...settings });
  }

  interruptSession(sessionId: string): void {
    this.send({ type: 'chat-interrupt', sessionId });
  }

  rewindSession(sessionId: string, messageId: string, dryRun?: boolean): void {
    this.send({ type: 'chat-rewind', sessionId, messageId, dryRun });
  }

  sendChatMessage(sessionId: string, text: string): void {
    this.send({ type: 'chat-send', sessionId, text });
  }

  approveTool(sessionId: string, toolId: string, approved: boolean): void {
    this.send({ type: 'chat-approve', sessionId, toolId, approved });
  }

  endChatSession(sessionId: string): void {
    this.send({ type: 'chat-end', sessionId });
  }

  // ── PTY (interactive terminal) controls ─────────────────────────────────────
  createPtySession(options: {
    projectPath: string;
    model?: string;
    resumeSessionId?: string;
    permissionMode?: string;
    cols?: number;
    rows?: number;
  }): void {
    this.send({ type: 'pty-create', ...options });
  }

  sendPtyInput(sessionId: string, data: string): void {
    this.send({ type: 'pty-input', sessionId, data });
  }

  resizePty(sessionId: string, cols: number, rows: number): void {
    this.send({ type: 'pty-resize', sessionId, cols, rows });
  }

  endPtySession(sessionId: string): void {
    this.send({ type: 'pty-end', sessionId });
  }

  // ── Chat event subscriptions ─────────────────────────────────────────────────
  onChatCreated(cb: ChatCreatedCallback): () => void {
    this.chatCreatedCbs.push(cb);
    return () => { this.chatCreatedCbs = this.chatCreatedCbs.filter((c) => c !== cb); };
  }

  onChatEvent(cb: ChatEventCallback): () => void {
    this.chatEventCbs.push(cb);
    return () => { this.chatEventCbs = this.chatEventCbs.filter((c) => c !== cb); };
  }

  onPtyOutput(cb: PtyOutputCallback): () => void {
    this.ptyOutputCbs.push(cb);
    return () => { this.ptyOutputCbs = this.ptyOutputCbs.filter((c) => c !== cb); };
  }

  onToolApproval(cb: ToolApprovalCallback): () => void {
    this.toolApprovalCbs.push(cb);
    return () => { this.toolApprovalCbs = this.toolApprovalCbs.filter((c) => c !== cb); };
  }

  onChatSessionEnd(cb: ChatEndCallback): () => void {
    this.chatEndCbs.push(cb);
    return () => { this.chatEndCbs = this.chatEndCbs.filter((c) => c !== cb); };
  }

  onPtyCreated(cb: PtyCreatedCallback): () => void {
    this.ptyCreatedCbs.push(cb);
    return () => { this.ptyCreatedCbs = this.ptyCreatedCbs.filter((c) => c !== cb); };
  }

  onPtyEnded(cb: PtyEndedCallback): () => void {
    this.ptyEndedCbs.push(cb);
    return () => { this.ptyEndedCbs = this.ptyEndedCbs.filter((c) => c !== cb); };
  }

  onSubagentStarted(cb: SubagentStartedCallback): () => void {
    this.subagentStartedCbs.push(cb);
    return () => { this.subagentStartedCbs = this.subagentStartedCbs.filter((c) => c !== cb); };
  }

  onSubagentCompleted(cb: SubagentCompletedCallback): () => void {
    this.subagentCompletedCbs.push(cb);
    return () => { this.subagentCompletedCbs = this.subagentCompletedCbs.filter((c) => c !== cb); };
  }

  onSubagentOutput(cb: SubagentOutputCallback): () => void {
    this.subagentOutputCbs.push(cb);
    return () => { this.subagentOutputCbs = this.subagentOutputCbs.filter((c) => c !== cb); };
  }

  onError(cb: (message: string) => void): () => void {
    this.errorCbs.push(cb);
    return () => { this.errorCbs = this.errorCbs.filter((c) => c !== cb); };
  }

  // ── Internal ─────────────────────────────────────────────────────────────────
  send(msg: object): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    } else {
      // Queue once connected
      const onOpen = () => {
        this.ws?.send(JSON.stringify(msg));
        this.ws?.removeEventListener('open', onOpen);
      };
      this.ws?.addEventListener('open', onOpen);
    }
  }

  destroy(): void {
    this.destroyed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
    this.subscribers.clear();
  }
}

let _client: LiveSessionClient | null = null;

export function getWsClient(): LiveSessionClient {
  if (!_client) {
    _client = new LiveSessionClient();
    _client.connect();
  }
  return _client;
}
