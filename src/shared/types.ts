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

// ─── WebSocket Message Types ──────────────────────────────────────────────────

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
