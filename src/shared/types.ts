// ─── Raw JSONL Entry Types ────────────────────────────────────────────────────

export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

export interface ContentBlock {
  type: 'thinking' | 'text' | 'tool_use' | 'tool_result';
  // thinking / text
  text?: string;
  thinking?: string;
  // tool_use
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  // tool_result
  tool_use_id?: string;
  content?: string | ContentBlock[];
  is_error?: boolean;
}

export interface RawAssistantMessage {
  role: 'assistant';
  content: ContentBlock[];
  model?: string;
  usage?: TokenUsage;
  stop_reason?: string;
}

export interface RawUserMessage {
  role: 'user';
  content: string | ContentBlock[];
}

export interface RawSessionEntry {
  type: 'user' | 'assistant' | 'system' | 'progress' | 'file-history-snapshot' | 'queue-operation' | 'pr-link' | 'summary';
  uuid: string;
  parentUuid?: string;
  sessionId: string;
  timestamp: string;  // ISO 8601
  cwd?: string;
  version?: string;
  gitBranch?: string;
  gitState?: unknown;
  message?: RawAssistantMessage | RawUserMessage | string;
  // progress entries
  content?: string;
  // pr-link entries
  url?: string;
  // summary entries
  summary?: string;
  isSidechain?: boolean;
  isMeta?: boolean;
  requestId?: string;
}

// ─── Processed Types ──────────────────────────────────────────────────────────

export interface ProcessedToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
  result?: string;
  isError?: boolean;
}

export interface ProcessedMessage {
  uuid: string;
  parentUuid?: string;
  timestamp: string;
  role: 'user' | 'assistant' | 'system';
  // assistant fields
  thinking?: string;
  text?: string;
  toolCalls?: ProcessedToolCall[];
  model?: string;
  usage?: TokenUsage;
  // user fields
  userText?: string;
  // tool results (in user messages matching previous tool_use)
  toolResults?: ProcessedToolCall[];
}

// ─── Session Types ─────────────────────────────────────────────────────────────

export interface SessionSummary {
  id: string;          // sessionId
  filePath: string;    // absolute path to .jsonl
  projectHash: string;
  projectName: string;
  projectPath: string;
  firstTimestamp: string;
  lastTimestamp: string;
  durationMs: number;
  messageCount: number;
  toolCallCount: number;
  editCount: number;
  tokenUsage: TokenUsage;
  estimatedCost: number;
  firstUserPrompt: string;
  model: string;
  gitBranch?: string;
  prLinks: string[];
}

export interface SessionDetail extends SessionSummary {
  messages: ProcessedMessage[];
}

// ─── Diff Types ───────────────────────────────────────────────────────────────

export interface FileDiff {
  sessionId: string;
  toolCallId: string;
  toolName: 'Edit' | 'Write';
  filePath: string;
  unifiedDiff: string;
  linesAdded: number;
  linesRemoved: number;
  timestamp: string;
}

// ─── Stats Types ──────────────────────────────────────────────────────────────

export interface DailyActivity {
  date: string;  // YYYY-MM-DD
  messageCount: number;
  tokenCount: number;
  sessionCount: number;
}

export interface ModelUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
}

export interface DashboardStats {
  totalSessions: number;
  totalMessages: number;
  totalTokens: number;
  totalCost: number;
  tokensToday: number;
  sessionsThisWeek: number;
  dailyActivity: DailyActivity[];  // 52 weeks
  modelUsage: ModelUsage[];
  hourCounts: number[];            // 24 hours
}

export interface TopFile {
  filePath: string;
  editCount: number;
  sessionCount: number;
  lastModified: string;
}

export interface ToolUsageStat {
  toolName: string;
  count: number;
  percentage: number;
}

// ─── Search Types ─────────────────────────────────────────────────────────────

export interface SearchResult {
  sessionId: string;
  projectName: string;
  timestamp: string;
  matchType: 'user-prompt' | 'assistant-response' | 'tool-call' | 'tool-result';
  snippet: string;
  score: number;
}

// ─── History Types ────────────────────────────────────────────────────────────

export interface HistoryEntry {
  display: string;
  timestamp: string;
  project?: string;
  sessionId?: string;
}

// ─── Project Types ────────────────────────────────────────────────────────────

export interface ProjectInfo {
  hash: string;
  name: string;
  path: string;
  sessionCount: number;
  lastActivity?: string;
}

// ─── Meta / Bookmark Types ────────────────────────────────────────────────────

export interface SessionMeta {
  sessionId: string;
  bookmarked: boolean;
  tags: string[];
  notes: string;
  updatedAt: string;
}

export interface CostBudget {
  daily?: number;
  weekly?: number;
  monthly?: number;
}

export interface DashboardMeta {
  sessions: Record<string, SessionMeta>;
  budgets: CostBudget;
}

// ─── Export Types ─────────────────────────────────────────────────────────────

export type ExportFormat = 'json' | 'markdown';

// ─── Tool Timing Types ────────────────────────────────────────────────────────

export interface ToolTiming {
  toolName: string;
  avgMs: number;
  maxMs: number;
  count: number;
  totalMs: number;
}

// ─── File Timeline Types ──────────────────────────────────────────────────────

export interface FileEdit {
  sessionId: string;
  projectName: string;
  timestamp: string;
  toolName: 'Edit' | 'Write';
  unifiedDiff: string;
  linesAdded: number;
  linesRemoved: number;
}

// ─── Subagent Types ──────────────────────────────────────────────────────────

export interface SubagentInfo {
  toolUseId: string;        // links to the Agent tool_use block
  agentId?: string;         // from agent_progress entries
  description: string;      // from Agent tool input
  subagentType: string;     // "Explore", "Plan", etc.
  isBackground: boolean;    // from run_in_background input
  status: 'running' | 'completed' | 'failed';
  resultSummary?: string;   // first ~500 chars of tool_result
  startedAt: string;
}

export interface SubagentStartedMsg   { type: 'subagent-started';   ptySessionId: string; agent: SubagentInfo; }
export interface SubagentProgressMsg  { type: 'subagent-progress';  ptySessionId: string; toolUseId: string; agentId: string; }
export interface SubagentCompletedMsg { type: 'subagent-completed'; ptySessionId: string; toolUseId: string; resultSummary: string; }
export interface SubagentOutputMsg    { type: 'subagent-output';    ptySessionId: string; toolUseId: string; data: string; }

// ─── WebSocket Message Types (live session replay) ───────────────────────────

export interface WsSubscribeMessage {
  type: 'subscribe';
  sessionId: string;
}

export interface WsSessionUpdateMessage {
  type: 'session-update';
  sessionId: string;
  entries: RawSessionEntry[];
}

export type WsClientMessage = WsSubscribeMessage;
export type WsServerMessage = WsSessionUpdateMessage;

// ─── Chat / PTY Stream Types ──────────────────────────────────────────────────

/** Events emitted by `claude --output-format stream-json` */
export type StreamEvent =
  | { type: 'system'; subtype: 'init'; session_id: string; tools: string[]; model: string; cwd?: string; permissionMode?: string }
  | { type: 'assistant'; message: RawAssistantMessage; session_id: string; uuid?: string; parent_tool_use_id?: string | null }
  | { type: 'user'; message: RawUserMessage; session_id: string; tool_use_result?: string }
  | { type: 'result'; subtype: 'success'; session_id: string; usage: TokenUsage; total_cost_usd: number; duration_ms: number; num_turns: number; permission_denials?: { tool_name: string; tool_use_id: string; tool_input: Record<string, unknown> }[] }
  | { type: 'result'; subtype: 'error_max_turns'; session_id: string; usage: TokenUsage; total_cost_usd: number; duration_ms: number; num_turns: number; permission_denials?: { tool_name: string; tool_use_id: string; tool_input: Record<string, unknown> }[] }
  | { type: 'result'; subtype: 'error'; error: string; is_error?: boolean }
  | { type: 'rate_limit_event'; [key: string]: unknown }
  | { type: 'tool'; subtype: 'approval_request'; tool_name: string; tool_id: string; input: Record<string, unknown> }
  | { type: 'tool'; subtype: 'result'; tool_id: string; output: string; is_error: boolean };

// Client → server
export interface ChatCreateMsg {
  type: 'chat-create';
  projectPath: string;
  model?: string;
  resumeSessionId?: string;
  permissionMode?: string;
  // Advanced settings
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
}
export interface ChatSendMsg      { type: 'chat-send';      sessionId: string; text: string; }
export interface ChatApproveMsg   { type: 'chat-approve';   sessionId: string; toolId: string; approved: boolean; }
export interface ChatEndMsg       { type: 'chat-end';       sessionId: string; }
export interface ChatSettingsMsg  { type: 'chat-settings';  sessionId: string; permissionMode?: string; model?: string; }
export interface ChatInterruptMsg { type: 'chat-interrupt'; sessionId: string; }
export interface ChatMcpMsg      { type: 'chat-mcp';       sessionId: string; action: 'toggle' | 'reconnect' | 'status'; serverName: string; enabled?: boolean; }
export interface ChatRewindMsg   { type: 'chat-rewind';    sessionId: string; messageId: string; dryRun?: boolean; }

// Server → client
export interface ChatCreatedMsg      { type: 'chat-created';          sessionId: string; }
export interface ChatEventMsg        { type: 'chat-event';            sessionId: string; event: StreamEvent; }
export interface PtyOutputMsg        { type: 'pty-output';            sessionId: string; data: string; }
export interface ToolApprovalReqMsg  { type: 'tool-approval-request'; sessionId: string; toolId: string; toolName: string; input: Record<string, unknown>; }
export interface ChatSessionEndMsg   { type: 'session-end';           sessionId: string; exitCode: number; }

// PTY (interactive terminal) messages
// Client → server
export interface PtyCreateMsg   { type: 'pty-create';  projectPath: string; model?: string; permissionMode?: string; resumeSessionId?: string; cols?: number; rows?: number; }
export interface PtyInputMsg    { type: 'pty-input';   sessionId: string; data: string; }
export interface PtyResizeMsg   { type: 'pty-resize';  sessionId: string; cols: number; rows: number; }
export interface PtyEndMsg      { type: 'pty-end';     sessionId: string; }
// Server → client
export interface PtyCreatedMsg  { type: 'pty-created'; sessionId: string; }
export interface PtyEndedMsg    { type: 'pty-ended';   sessionId: string; exitCode: number; }
