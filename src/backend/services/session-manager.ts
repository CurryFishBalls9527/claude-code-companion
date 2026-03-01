import { randomUUID } from 'crypto';
import { existsSync } from 'fs';
import { query } from '@anthropic-ai/claude-agent-sdk';
import type {
  ChatCreatedMsg,
  ChatEventMsg,
  ToolApprovalReqMsg,
  ChatSessionEndMsg,
  StreamEvent,
} from '../../shared/types.js';

type OutboundMsg =
  | ChatCreatedMsg
  | ChatEventMsg
  | ToolApprovalReqMsg
  | ChatSessionEndMsg;

interface PendingApproval {
  resolve: (result: { approved: boolean; updatedInput?: Record<string, unknown> }) => void;
}

interface ActiveChat {
  status: 'starting' | 'active' | 'waiting_approval' | 'ended';
  claudeSessionId?: string;
  pendingApprovals: Map<string, PendingApproval>;
  // For streaming input mode: push new messages into the generator
  pushMessage: ((msg: SDKUserMsg) => void) | null;
  // Signal to close the generator (end session)
  endGenerator: (() => void) | null;
  // AbortController to cancel the query
  abortController: AbortController;
  // Track whether we've received stream deltas for current turn
  hasStreamedDeltas: boolean;
}

interface SDKUserMsg {
  type: 'user';
  message: {
    role: 'user';
    content: string;
  };
  parent_tool_use_id: string | null;
  session_id: string;
}

export class SessionManager {
  private chats = new Map<string, ActiveChat>();
  private notify: (sessionId: string, msg: OutboundMsg) => void;

  constructor(notify: (sessionId: string, msg: OutboundMsg) => void) {
    this.notify = notify;
  }

  createSession(options: {
    projectPath: string;
    model?: string;
    resumeSessionId?: string;
    permissionMode?: string;
  }): string {
    const sessionId = randomUUID();
    const abortController = new AbortController();

    // Validate cwd exists — spawn fails with misleading ENOENT otherwise
    const cwd = options.projectPath || process.cwd();
    if (!existsSync(cwd)) {
      throw new Error(`Project path does not exist: ${cwd}`);
    }
    console.log(`[SessionManager] Starting session ${sessionId.slice(0, 8)} in ${cwd}`);

    // Create a message queue for the async generator
    let pushMessage: ((msg: SDKUserMsg) => void) | null = null;
    let endGenerator: (() => void) | null = null;

    const chat: ActiveChat = {
      status: 'starting',
      pendingApprovals: new Map(),
      pushMessage: null,
      endGenerator: null,
      abortController,
      hasStreamedDeltas: false,
    };
    this.chats.set(sessionId, chat);

    // Build the async generator that yields user messages over time
    const messageQueue: SDKUserMsg[] = [];
    let messageResolve: ((value: { value: SDKUserMsg; done: false } | { done: true }) => void) | null = null;
    let generatorDone = false;

    async function* generateMessages(): AsyncGenerator<SDKUserMsg, void> {
      while (!generatorDone) {
        if (messageQueue.length > 0) {
          yield messageQueue.shift()!;
        } else {
          // Wait for the next message
          const result = await new Promise<{ value: SDKUserMsg; done: false } | { done: true }>((resolve) => {
            messageResolve = resolve as any;
          });
          messageResolve = null;
          if (result.done) return;
          yield result.value;
        }
      }
    }

    pushMessage = (msg: SDKUserMsg) => {
      if (generatorDone) return;
      if (messageResolve) {
        messageResolve({ value: msg, done: false });
      } else {
        messageQueue.push(msg);
      }
    };

    endGenerator = () => {
      generatorDone = true;
      if (messageResolve) {
        messageResolve({ done: true });
      }
    };

    chat.pushMessage = pushMessage;
    chat.endGenerator = endGenerator;

    // Strip CLAUDECODE env var so nested sessions are allowed
    const { CLAUDECODE: _omit, ...cleanEnv } = process.env as Record<string, string | undefined>;

    // Build options for query()
    const queryOptions: Record<string, unknown> = {
      abortController,
      cwd,
      env: cleanEnv,
      includePartialMessages: true,
      settingSources: ['user', 'project', 'local'],
      systemPrompt: { type: 'preset', preset: 'claude_code' },
      stderr: (data: string) => {
        console.error(`[Claude stderr] ${data.trimEnd()}`);
      },
    };

    if (options.model) queryOptions.model = options.model;
    if (options.resumeSessionId) queryOptions.resume = options.resumeSessionId;

    if (options.permissionMode) {
      queryOptions.permissionMode = options.permissionMode;
      if (options.permissionMode === 'bypassPermissions') {
        queryOptions.allowDangerouslySkipPermissions = true;
      }
    }

    // canUseTool callback — surfaces tool approval requests to the browser
    queryOptions.canUseTool = async (
      toolName: string,
      input: Record<string, unknown>,
      callbackOptions: { signal: AbortSignal; toolUseID: string },
    ) => {
      const approvalId = callbackOptions.toolUseID || randomUUID();

      // Notify browser of approval request
      this.notify(sessionId, {
        type: 'tool-approval-request',
        sessionId,
        toolId: approvalId,
        toolName,
        input,
      });

      chat.status = 'waiting_approval';

      // Wait for user response
      const decision = await new Promise<{ approved: boolean; updatedInput?: Record<string, unknown> }>((resolve) => {
        chat.pendingApprovals.set(approvalId, { resolve });
      });

      chat.status = 'active';

      if (decision.approved) {
        return { behavior: 'allow' as const, updatedInput: decision.updatedInput ?? input };
      } else {
        return { behavior: 'deny' as const, message: 'User denied this action' };
      }
    };

    // Run the query in the background
    this.runQuery(sessionId, chat, generateMessages(), queryOptions);

    return sessionId;
  }

  private async runQuery(
    sessionId: string,
    chat: ActiveChat,
    messageGenerator: AsyncGenerator<SDKUserMsg, void>,
    options: Record<string, unknown>,
  ): Promise<void> {
    try {
      const q = query({
        prompt: messageGenerator as AsyncIterable<any>,
        options: options as any,
      });

      for await (const message of q) {
        if (chat.status === 'ended') break;

        // Convert SDK messages to StreamEvent format for the frontend
        const event = this.sdkMessageToStreamEvent(message, chat);
        if (event) {
          // Track claude session ID from init
          if (event.type === 'system' && 'subtype' in event && event.subtype === 'init') {
            chat.claudeSessionId = event.session_id;
            chat.status = 'active';
          }

          this.notify(sessionId, { type: 'chat-event', sessionId, event });

          // Reset delta tracking after each result (ready for next turn)
          if (event.type === 'result') {
            chat.hasStreamedDeltas = false;
          }
        }
      }
    } catch (err: unknown) {
      if (chat.status !== 'ended') {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.error(`[SessionManager] Query error for ${sessionId}:`, errorMsg);
        const errorEvent: StreamEvent = {
          type: 'result',
          subtype: 'error',
          error: errorMsg,
          is_error: true,
        };
        this.notify(sessionId, { type: 'chat-event', sessionId, event: errorEvent });
      }
    } finally {
      chat.status = 'ended';
      this.chats.delete(sessionId);
      this.notify(sessionId, { type: 'session-end', sessionId, exitCode: 0 });
    }
  }

  /**
   * Convert an SDK message to our StreamEvent format.
   * The SDK emits different message types than the raw CLI JSONL protocol,
   * so we translate them to keep the frontend store logic consistent.
   */
  private sdkMessageToStreamEvent(msg: any, chat: ActiveChat): StreamEvent | null {
    if (!msg || !msg.type) return null;

    // System init message
    if (msg.type === 'system' && msg.subtype === 'init') {
      return {
        type: 'system',
        subtype: 'init',
        session_id: msg.session_id,
        tools: msg.tools ?? [],
        model: msg.model ?? '',
        cwd: msg.cwd,
        permissionMode: msg.permissionMode,
      };
    }

    // Streaming partial (from includePartialMessages)
    if (msg.type === 'stream_event') {
      chat.hasStreamedDeltas = true;

      // The SDK wraps Anthropic API stream events.
      // We translate the relevant ones into our assistant StreamEvent format.
      const event = msg.event;
      if (!event) return null;

      // Content block start — tool_use: emit as assistant event so the frontend
      // adds it to the streaming tool list without triggering the approval dialog.
      // The actual approval goes through the canUseTool callback.
      if (event.type === 'content_block_start' && event.content_block?.type === 'tool_use') {
        return {
          type: 'assistant',
          message: {
            role: 'assistant',
            content: [{ type: 'tool_use', id: event.content_block.id, name: event.content_block.name, input: {} }],
          },
          session_id: msg.session_id ?? '',
        };
      }

      // For text/thinking deltas, we wrap them as partial assistant messages
      // Build a synthetic assistant event with just the delta content
      if (event.type === 'content_block_delta') {
        const delta = event.delta;
        if (!delta) return null;

        const content: any[] = [];
        if (delta.type === 'text_delta' && delta.text) {
          content.push({ type: 'text', text: delta.text });
        } else if (delta.type === 'thinking_delta' && delta.thinking) {
          content.push({ type: 'thinking', thinking: delta.thinking });
        } else if (delta.type === 'input_json_delta') {
          // Tool input streaming — skip for now, will be in final message
          return null;
        }

        if (content.length === 0) return null;

        return {
          type: 'assistant',
          message: { role: 'assistant', content },
          session_id: msg.session_id ?? '',
        };
      }

      return null;
    }

    // Complete assistant message
    if (msg.type === 'assistant') {
      const assistantMsg = msg.message;
      if (!assistantMsg) return null;

      // If we already streamed deltas for this turn, skip the duplicate complete message
      if (chat.hasStreamedDeltas) return null;

      // No deltas were streamed — this is a replay message from session resume
      return {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: assistantMsg.content ?? [],
          model: assistantMsg.model,
          usage: assistantMsg.usage,
          stop_reason: assistantMsg.stop_reason,
        },
        session_id: msg.session_id ?? '',
        uuid: msg.uuid,
        parent_tool_use_id: msg.parent_tool_use_id ?? undefined,
      };
    }

    // User message (tool results)
    if (msg.type === 'user') {
      return {
        type: 'user',
        message: msg.message ?? { role: 'user', content: '' },
        session_id: msg.session_id ?? '',
      };
    }

    // Result message
    if (msg.type === 'result') {
      if (msg.subtype === 'success') {
        return {
          type: 'result',
          subtype: 'success',
          session_id: msg.session_id ?? '',
          usage: msg.usage ?? { input_tokens: 0, output_tokens: 0 },
          total_cost_usd: msg.total_cost_usd ?? 0,
          duration_ms: msg.duration_ms ?? 0,
          num_turns: msg.num_turns ?? 0,
          permission_denials: msg.permission_denials,
        };
      }

      if (msg.subtype === 'error_max_turns' || msg.subtype === 'error_during_execution' || msg.subtype === 'error_max_budget_usd') {
        return {
          type: 'result',
          subtype: 'error_max_turns',
          session_id: msg.session_id ?? '',
          usage: msg.usage ?? { input_tokens: 0, output_tokens: 0 },
          total_cost_usd: msg.total_cost_usd ?? 0,
          duration_ms: msg.duration_ms ?? 0,
          num_turns: msg.num_turns ?? 0,
          permission_denials: msg.permission_denials,
        };
      }

      // Generic error
      return {
        type: 'result',
        subtype: 'error',
        error: msg.errors?.join(', ') ?? 'Unknown error',
        is_error: true,
      };
    }

    // Tool use summary messages
    if (msg.type === 'tool_use_summary') {
      // Contains tool_name, tool_use_id, output, is_error
      return {
        type: 'tool',
        subtype: 'result',
        tool_id: msg.tool_use_id ?? '',
        output: typeof msg.output === 'string' ? msg.output : JSON.stringify(msg.output ?? ''),
        is_error: msg.is_error ?? false,
      };
    }

    return null;
  }

  sendMessage(sessionId: string, text: string): void {
    const chat = this.chats.get(sessionId);
    if (!chat || chat.status === 'ended') return;
    chat.pushMessage?.({
      type: 'user',
      message: { role: 'user', content: text },
      parent_tool_use_id: null,
      session_id: chat.claudeSessionId ?? '',
    });
  }

  approveToolUse(sessionId: string, toolId: string, approved: boolean): void {
    const chat = this.chats.get(sessionId);
    if (!chat) return;
    const pending = chat.pendingApprovals.get(toolId);
    if (pending) {
      pending.resolve({ approved });
      chat.pendingApprovals.delete(toolId);
    }
  }

  endSession(sessionId: string): void {
    const chat = this.chats.get(sessionId);
    if (!chat) return;
    chat.status = 'ended';
    chat.endGenerator?.();
    chat.abortController.abort();
    // Resolve all pending approvals so they don't hang
    for (const [, pending] of chat.pendingApprovals) {
      pending.resolve({ approved: false });
    }
    chat.pendingApprovals.clear();
    this.chats.delete(sessionId);
  }

  listSessions() {
    return Array.from(this.chats.entries()).map(([id, chat]) => ({
      id,
      projectPath: '',
      model: undefined as string | undefined,
      status: chat.status,
      createdAt: new Date(),
    }));
  }
}
