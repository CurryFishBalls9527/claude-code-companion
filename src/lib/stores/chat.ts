import { writable, get } from 'svelte/store';
import { getWsClient } from '$lib/api/websocket.js';
import type { StreamEvent, ToolApprovalReqMsg } from '$shared/types.js';

export interface StreamingState {
  thinking: string;
  text: string;
  toolCalls: { id: string; name: string; input: Record<string, unknown>; result?: string; isError?: boolean }[];
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  thinking?: string;
  text?: string;
  toolCalls?: { id: string; name: string; input: Record<string, unknown>; result?: string; isError?: boolean }[];
  timestamp: string;
  usage?: { input_tokens: number; output_tokens: number };
  cost?: number;
  isReplay?: boolean;
  uuid?: string;
}

export interface SlashCommand {
  name: string;
  description?: string;
  isBuiltIn?: boolean;
}

export interface AgentInfo {
  name: string;
  description?: string;
}

export interface ChatState {
  sessionId: string | null;
  claudeSessionId: string | null;  // Claude's internal session ID (for resume)
  projectPath: string;
  model: string;
  permissionMode: string;
  status: 'idle' | 'creating' | 'active' | 'waiting_approval' | 'ended';
  messages: ChatMessage[];
  streaming: StreamingState;
  isStreaming: boolean;
  pendingApproval: null | { toolId: string; toolName: string; input: Record<string, unknown> };
  error: string | null;
  promptHistory: string[];
  // Capabilities from SDK
  availableCommands: SlashCommand[];
  availableAgents: AgentInfo[];
  availableModels: string[];
}

const DEFAULT_STATE: ChatState = {
  sessionId: null,
  claudeSessionId: null,
  projectPath: '',
  model: 'claude-sonnet-4-6',
  permissionMode: 'default',
  status: 'idle',
  messages: [],
  streaming: { thinking: '', text: '', toolCalls: [] },
  isStreaming: false,
  pendingApproval: null,
  error: null,
  promptHistory: [],
  availableCommands: [],
  availableAgents: [],
  availableModels: [],
};

export const chatState = writable<ChatState>({ ...DEFAULT_STATE });

function resetStreaming(): StreamingState {
  return { thinking: '', text: '', toolCalls: [] };
}

export function handleStreamEvent(event: StreamEvent): void {
  chatState.update((s) => {
    const next = { ...s };

    // Handle system events (init + capabilities) — use 'as any' since capabilities
    // is a custom subtype not in the StreamEvent union
    const anyEvent = event as any;
    if (anyEvent.type === 'system' && anyEvent.subtype === 'init') {
      next.claudeSessionId = anyEvent.session_id;
      next.status = 'active';
      if (anyEvent.model) next.model = anyEvent.model;
      if (anyEvent.permissionMode) next.permissionMode = anyEvent.permissionMode;
      // Don't reset streaming state — init arrives after first message
      return next;
    }

    if (anyEvent.type === 'system' && anyEvent.subtype === 'capabilities') {
      next.availableCommands = anyEvent.commands ?? [];
      next.availableAgents = anyEvent.agents ?? [];
      next.availableModels = anyEvent.models ?? [];
      return next;
    }

    if (event.type === 'assistant') {
      const content = event.message?.content ?? [];
      const msg = event.message as any;

      // Complete assistant message from session replay (has usage or stop_reason)
      // goes directly into messages[], not streaming accumulation
      if (msg?.usage || msg?.stop_reason) {
        let thinking = '';
        let text = '';
        const toolCalls: { id: string; name: string; input: Record<string, unknown> }[] = [];

        for (const block of content) {
          if (block.type === 'thinking' && block.thinking) thinking += block.thinking;
          else if (block.type === 'text' && block.text) text += block.text;
          else if (block.type === 'tool_use' && block.id && block.name) {
            toolCalls.push({ id: block.id, name: block.name, input: (block.input ?? {}) as Record<string, unknown> });
          }
        }

        const chatMsg: ChatMessage = {
          role: 'assistant',
          thinking: thinking || undefined,
          text: text || undefined,
          toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
          timestamp: new Date().toISOString(),
          usage: msg.usage,
          isReplay: (event as any).isReplay ?? false,
          uuid: (event as any).uuid,
        };
        next.messages = [...next.messages, chatMsg];
        return next;
      }

      // Streaming delta — accumulate into streaming state
      next.isStreaming = true;
      let thinking = next.streaming.thinking;
      let text = next.streaming.text;
      const tools = [...next.streaming.toolCalls];

      for (const block of content) {
        if (block.type === 'thinking' && block.thinking) {
          thinking += block.thinking;
        } else if (block.type === 'text' && block.text) {
          text += block.text;
        } else if (block.type === 'tool_use' && block.id && block.name) {
          tools.push({ id: block.id, name: block.name, input: (block.input ?? {}) as Record<string, unknown> });
        }
      }

      next.streaming = { thinking, text, toolCalls: tools };
      return next;
    }

    if (event.type === 'tool' && event.subtype === 'approval_request') {
      next.status = 'waiting_approval';
      next.pendingApproval = { toolId: event.tool_id, toolName: event.tool_name, input: event.input };
      return next;
    }

    if (event.type === 'tool' && event.subtype === 'result') {
      const tools = next.streaming.toolCalls.map((tc) =>
        tc.id === event.tool_id
          ? { ...tc, result: event.output, isError: event.is_error }
          : tc
      );
      next.streaming = { ...next.streaming, toolCalls: tools };
      return next;
    }

    // User events carry tool results (including permission denials)
    if (event.type === 'user' && event.tool_use_result) {
      // Match tool result back to streaming tool calls
      const content = typeof event.message?.content === 'string' ? [] : (event.message?.content ?? []);
      const tools = [...next.streaming.toolCalls];
      for (const block of content) {
        if (block.type === 'tool_result' && block.tool_use_id) {
          const idx = tools.findIndex((tc) => tc.id === block.tool_use_id);
          if (idx >= 0) {
            const resultText = typeof block.content === 'string' ? block.content : JSON.stringify(block.content);
            tools[idx] = { ...tools[idx], result: resultText, isError: block.is_error };
          }
        }
      }
      next.streaming = { ...next.streaming, toolCalls: tools };
      return next;
    }

    if (event.type === 'result' && (event.subtype === 'success' || event.subtype === 'error_max_turns')) {
      // Build permission denial warning text
      let denialText = '';
      if ('permission_denials' in event && event.permission_denials && event.permission_denials.length > 0) {
        const names = event.permission_denials.map((d) => d.tool_name).join(', ');
        denialText = `\n\n⚠️ Permission denied for: ${names}. Consider using "Accept edits" or "Bypass all" permission mode.`;
      }

      const msg: ChatMessage = {
        role: 'assistant',
        thinking: next.streaming.thinking || undefined,
        text: (next.streaming.text || '') + denialText || undefined,
        toolCalls: next.streaming.toolCalls.length > 0 ? next.streaming.toolCalls : undefined,
        timestamp: new Date().toISOString(),
        usage: event.usage,
        cost: event.total_cost_usd,
      };
      next.messages = [...next.messages, msg];
      next.streaming = resetStreaming();
      next.isStreaming = false;
      next.status = 'active';
      next.pendingApproval = null;
      return next;
    }

    if (event.type === 'result' && event.subtype === 'error') {
      next.error = event.error;
      next.isStreaming = false;
      next.streaming = resetStreaming();
      next.status = 'active';
      return next;
    }

    return next;
  });
}

export function createChatSession(options: {
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
  const ws = getWsClient();
  chatState.update((s) => ({
    ...DEFAULT_STATE,
    projectPath: options.projectPath,
    model: options.model ?? s.model,
    permissionMode: options.permissionMode ?? s.permissionMode,
    status: 'creating',
    promptHistory: s.promptHistory,
    // Pre-set claudeSessionId from resumeSessionId (init event may not fire during resume)
    claudeSessionId: options.resumeSessionId ?? null,
  }));
  ws.createChatSession(options);
}

export function sendChatMessage(text: string): void {
  const s = get(chatState);
  if (!s.sessionId || s.status !== 'active') return;
  const msg: ChatMessage = { role: 'user', text, timestamp: new Date().toISOString() };
  chatState.update((st) => ({
    ...st,
    messages: [...st.messages, msg],
    isStreaming: true,
    streaming: resetStreaming(),
    promptHistory: [text, ...st.promptHistory.slice(0, 49)],
  }));
  getWsClient().sendChatMessage(s.sessionId, text);
}

export function approveToolUse(toolId: string, approved: boolean): void {
  const s = get(chatState);
  if (!s.sessionId) return;
  chatState.update((st) => ({ ...st, pendingApproval: null, status: 'active' }));
  getWsClient().approveTool(s.sessionId, toolId, approved);
}

export function endChatSession(): void {
  const s = get(chatState);
  if (!s.sessionId) return;
  getWsClient().endChatSession(s.sessionId);
  chatState.update((st) => ({ ...st, status: 'ended' }));
}

export function resetChat(): void {
  chatState.update((s) => ({ ...DEFAULT_STATE, promptHistory: s.promptHistory }));
}
