import type { SessionManager } from './session-manager.js';
import type { TelegramConfig } from './telegram-config.js';
import type { StreamEvent, ContentBlock } from '../../shared/types.js';

// Types from grammy (dynamically imported)
type BotType = import('grammy').Bot;
type ContextType = import('grammy').Context;

/** Per-chat state binding a Telegram chat to a Claude session */
interface ChatBinding {
  sessionId: string;
  projectPath: string;
  /** Accumulates streamed text before sending */
  pendingText: string;
  /** Timer for batching streamed text into messages */
  flushTimer: ReturnType<typeof setTimeout> | null;
  /** Telegram message ID of the current streaming message (for editing) */
  streamingMsgId: number | null;
}

const TELEGRAM_MSG_LIMIT = 4096;
const FLUSH_DELAY_MS = 800;

export class TelegramBot {
  private bot: BotType | null = null;
  private sessionManager: SessionManager;
  private config: TelegramConfig;
  private chatBindings = new Map<number, ChatBinding>(); // chatId → binding
  private sessionToChat = new Map<string, number>(); // sessionId → chatId
  private running = false;

  constructor(sessionManager: SessionManager, config: TelegramConfig) {
    this.sessionManager = sessionManager;
    this.config = config;
  }

  /** Start the bot (polling mode). Idempotent — stops first if already running. */
  async start(): Promise<void> {
    await this.stop();

    if (!this.config.botToken || !this.config.enabled) return;

    const { Bot, InlineKeyboard } = await import('grammy');
    this.bot = new Bot(this.config.botToken);

    this.registerHandlers(InlineKeyboard);

    // Start polling (non-blocking)
    this.bot.start({
      onStart: () => {
        this.running = true;
        console.log('[Telegram] Bot started polling');
      },
    });
  }

  /** Stop the bot gracefully */
  async stop(): Promise<void> {
    if (this.bot && this.running) {
      try {
        await this.bot.stop();
      } catch {
        // ignore
      }
      this.running = false;
      this.bot = null;
      console.log('[Telegram] Bot stopped');
    }
  }

  /** Update config and restart if needed */
  async updateConfig(config: TelegramConfig): Promise<void> {
    this.config = config;
    if (config.enabled && config.botToken) {
      await this.start();
    } else {
      await this.stop();
    }
  }

  /** Check if bot is currently running */
  isRunning(): boolean {
    return this.running;
  }

  /** Send a test message to verify the bot works */
  async sendTestMessage(chatId: number): Promise<boolean> {
    if (!this.bot || !this.running) return false;
    try {
      await this.bot.api.sendMessage(chatId, 'Claude Dashboard: Test message received successfully!');
      return true;
    } catch (e) {
      console.error('[Telegram] Test message failed:', e);
      return false;
    }
  }

  // ── Event handler: called by server.ts when SessionManager emits events ──

  handleSessionEvent(sessionId: string, msg: any): void {
    const chatId = this.sessionToChat.get(sessionId);
    if (!chatId || !this.bot) return;

    const binding = this.chatBindings.get(chatId);
    if (!binding) return;

    if (msg.type === 'chat-event') {
      this.handleStreamEvent(chatId, binding, msg.event as StreamEvent);
    } else if (msg.type === 'tool-approval-request') {
      this.handleToolApproval(chatId, msg);
    } else if (msg.type === 'session-end') {
      this.sendMessage(chatId, `Session ended.`);
      this.cleanupBinding(chatId);
    }
  }

  // ── Private: Register bot commands and handlers ──

  private registerHandlers(InlineKeyboard: any): void {
    if (!this.bot) return;

    // Auth middleware — reject unauthorized users
    this.bot.use(async (ctx, next) => {
      const userId = ctx.from?.id;
      if (!userId || !this.config.allowedUserIds.includes(userId)) {
        await ctx.reply('Unauthorized. Your user ID: ' + (userId ?? 'unknown'));
        return;
      }
      await next();
    });

    this.bot.command('start', async (ctx) => {
      await ctx.reply(
        'Welcome to Claude Dashboard!\n\n' +
        'Commands:\n' +
        '/new <project_path> — Start a new session\n' +
        '/resume <session_id> — Resume a session\n' +
        '/end — End current session\n' +
        '/status — Current session info\n' +
        '/sessions — List active sessions\n' +
        '/projects — List available projects\n' +
        '/model <name> — Switch model\n' +
        '/stop — Interrupt generation\n\n' +
        'Send any text to chat with Claude in the active session.'
      );
    });

    this.bot.command('new', async (ctx) => {
      const projectPath = ctx.match?.trim();
      if (!projectPath) {
        await ctx.reply('Usage: /new <project_path>\nExample: /new /Users/me/myproject');
        return;
      }

      const chatId = ctx.chat.id;
      const existing = this.chatBindings.get(chatId);
      if (existing) {
        await ctx.reply('You already have an active session. Use /end first.');
        return;
      }

      try {
        const sessionId = this.sessionManager.createSession({ projectPath });
        this.bindSession(chatId, sessionId, projectPath);
        await ctx.reply(`Session started: \`${sessionId.slice(0, 8)}\`\nProject: ${projectPath}\n\nSend a message to start chatting.`, { parse_mode: 'Markdown' });
      } catch (e) {
        await ctx.reply(`Failed to create session: ${e instanceof Error ? e.message : String(e)}`);
      }
    });

    this.bot.command('resume', async (ctx) => {
      const resumeId = ctx.match?.trim();
      if (!resumeId) {
        await ctx.reply('Usage: /resume <session_id>');
        return;
      }

      const chatId = ctx.chat.id;
      const existing = this.chatBindings.get(chatId);
      if (existing) {
        await ctx.reply('You already have an active session. Use /end first.');
        return;
      }

      try {
        // Resume needs a project path — we'll use cwd as fallback
        const sessionId = this.sessionManager.createSession({
          projectPath: process.cwd(),
          resumeSessionId: resumeId,
        });
        this.bindSession(chatId, sessionId, process.cwd());
        await ctx.reply(`Resuming session \`${resumeId.slice(0, 8)}\`...`, { parse_mode: 'Markdown' });
      } catch (e) {
        await ctx.reply(`Failed to resume: ${e instanceof Error ? e.message : String(e)}`);
      }
    });

    this.bot.command('end', async (ctx) => {
      const chatId = ctx.chat.id;
      const binding = this.chatBindings.get(chatId);
      if (!binding) {
        await ctx.reply('No active session.');
        return;
      }
      this.sessionManager.endSession(binding.sessionId);
      this.cleanupBinding(chatId);
      await ctx.reply('Session ended.');
    });

    this.bot.command('status', async (ctx) => {
      const chatId = ctx.chat.id;
      const binding = this.chatBindings.get(chatId);
      if (!binding) {
        await ctx.reply('No active session. Use /new to start one.');
        return;
      }
      const sessions = this.sessionManager.listSessions();
      const session = sessions.find(s => s.id === binding.sessionId);
      const status = session?.status ?? 'unknown';
      await ctx.reply(
        `Session: \`${binding.sessionId.slice(0, 8)}\`\n` +
        `Project: ${binding.projectPath}\n` +
        `Status: ${status}`,
        { parse_mode: 'Markdown' }
      );
    });

    this.bot.command('sessions', async (ctx) => {
      const sessions = this.sessionManager.listSessions();
      if (sessions.length === 0) {
        await ctx.reply('No active sessions.');
        return;
      }
      const lines = sessions.map(s =>
        `\`${s.id.slice(0, 8)}\` — ${s.status}`
      );
      await ctx.reply('Active sessions:\n' + lines.join('\n'), { parse_mode: 'Markdown' });
    });

    this.bot.command('projects', async (ctx) => {
      try {
        // Dynamically import to avoid circular deps
        const { discoverProjects } = await import('./claude-data.js');
        const projects = await discoverProjects();
        if (projects.length === 0) {
          await ctx.reply('No projects found.');
          return;
        }

        const keyboard = new InlineKeyboard();
        for (const p of projects.slice(0, 10)) {
          keyboard.text(p.name, `project:${p.path}`).row();
        }
        await ctx.reply('Select a project to start a session:', { reply_markup: keyboard });
      } catch (e) {
        await ctx.reply('Failed to list projects.');
      }
    });

    this.bot.command('model', async (ctx) => {
      const modelName = ctx.match?.trim();
      if (!modelName) {
        await ctx.reply('Usage: /model <model_name>\nExample: /model claude-sonnet-4-6');
        return;
      }
      const binding = this.chatBindings.get(ctx.chat.id);
      if (!binding) {
        await ctx.reply('No active session.');
        return;
      }
      try {
        await this.sessionManager.setModel(binding.sessionId, modelName);
        await ctx.reply(`Model switched to: ${modelName}`);
      } catch (e) {
        await ctx.reply(`Failed to switch model: ${e instanceof Error ? e.message : String(e)}`);
      }
    });

    this.bot.command('stop', async (ctx) => {
      const binding = this.chatBindings.get(ctx.chat.id);
      if (!binding) {
        await ctx.reply('No active session.');
        return;
      }
      try {
        await this.sessionManager.interrupt(binding.sessionId);
        await ctx.reply('Generation interrupted.');
      } catch (e) {
        await ctx.reply('Failed to interrupt.');
      }
    });

    // ── Callback query handler (for inline keyboards) ──
    this.bot.on('callback_query:data', async (ctx) => {
      const data = ctx.callbackQuery.data;

      // Tool approval: approve:<sessionId>:<toolId> or deny:<sessionId>:<toolId>
      if (data.startsWith('approve:') || data.startsWith('deny:')) {
        const parts = data.split(':');
        const action = parts[0];
        const sessionId = parts[1];
        const toolId = parts[2];
        if (sessionId && toolId) {
          this.sessionManager.approveToolUse(sessionId, toolId, action === 'approve');
          await ctx.editMessageText(
            (ctx.callbackQuery.message as any)?.text + `\n\n${action === 'approve' ? 'Allowed' : 'Denied'}`,
          );
        }
        await ctx.answerCallbackQuery();
        return;
      }

      // Project selection: project:<path>
      if (data.startsWith('project:')) {
        const projectPath = data.slice('project:'.length);
        const chatId = ctx.chat?.id;
        if (!chatId) return;

        const existing = this.chatBindings.get(chatId);
        if (existing) {
          await ctx.answerCallbackQuery({ text: 'End current session first (/end)' });
          return;
        }

        try {
          const sessionId = this.sessionManager.createSession({ projectPath });
          this.bindSession(chatId, sessionId, projectPath);
          await ctx.editMessageText(`Session started for: ${projectPath}\nSession: \`${sessionId.slice(0, 8)}\`\n\nSend a message to chat.`, { parse_mode: 'Markdown' });
        } catch (e) {
          await ctx.editMessageText(`Failed: ${e instanceof Error ? e.message : String(e)}`);
        }
        await ctx.answerCallbackQuery();
        return;
      }

      await ctx.answerCallbackQuery();
    });

    // ── Plain text messages → send as prompts ──
    this.bot.on('message:text', async (ctx) => {
      const chatId = ctx.chat.id;
      const binding = this.chatBindings.get(chatId);

      if (!binding) {
        await ctx.reply('No active session. Use /new <project_path> or /projects to start one.');
        return;
      }

      this.sessionManager.sendMessage(binding.sessionId, ctx.message.text);
    });
  }

  // ── Private: Session binding ──

  private bindSession(chatId: number, sessionId: string, projectPath: string): void {
    this.chatBindings.set(chatId, {
      sessionId,
      projectPath,
      pendingText: '',
      flushTimer: null,
      streamingMsgId: null,
    });
    this.sessionToChat.set(sessionId, chatId);
  }

  private cleanupBinding(chatId: number): void {
    const binding = this.chatBindings.get(chatId);
    if (binding) {
      if (binding.flushTimer) clearTimeout(binding.flushTimer);
      this.sessionToChat.delete(binding.sessionId);
    }
    this.chatBindings.delete(chatId);
  }

  // ── Private: Handle stream events from SessionManager ──

  private handleStreamEvent(chatId: number, binding: ChatBinding, event: StreamEvent): void {
    if (event.type === 'system' && 'subtype' in event && event.subtype === 'init') {
      this.sendMessage(chatId, `Connected to Claude (${event.model})`);
      return;
    }

    if (event.type === 'assistant') {
      const msg = event.message;
      if (!msg?.content) return;

      for (const block of msg.content as ContentBlock[]) {
        if (block.type === 'text' && block.text) {
          this.appendStreamText(chatId, binding, block.text);
        } else if (block.type === 'thinking' && block.thinking) {
          // Show a brief thinking indicator, don't flood with full thinking
          if (binding.pendingText === '' && !binding.streamingMsgId) {
            this.sendMessage(chatId, '_Thinking..._', 'Markdown');
          }
        } else if (block.type === 'tool_use' && block.name) {
          // Flush any pending text before showing tool use
          this.flushStreamText(chatId, binding);
          const inputSummary = this.formatToolInput(block.name, block.input ?? {});
          this.sendMessage(chatId, `Tool: *${block.name}*\n${inputSummary}`, 'Markdown');
        }
      }

      // If the message has usage (complete message), flush
      if (msg.usage) {
        this.flushStreamText(chatId, binding);
      }
      return;
    }

    if (event.type === 'tool' && 'subtype' in event && event.subtype === 'result') {
      const output = (event as any).output ?? '';
      const truncated = output.length > 200 ? output.slice(0, 200) + '...' : output;
      if (truncated) {
        this.sendMessage(chatId, `\`\`\`\n${truncated}\n\`\`\``, 'Markdown');
      }
      return;
    }

    if (event.type === 'result') {
      this.flushStreamText(chatId, binding);
      if ('subtype' in event && event.subtype === 'success') {
        const cost = (event as any).total_cost_usd;
        if (cost) {
          this.sendMessage(chatId, `_Turn complete ($${cost.toFixed(4)})_`, 'Markdown');
        }
      } else if ('subtype' in event && event.subtype === 'error') {
        this.sendMessage(chatId, `Error: ${(event as any).error ?? 'Unknown error'}`);
      }
      return;
    }
  }

  private async handleToolApproval(chatId: number, msg: any): Promise<void> {
    if (!this.bot) return;
    const { sessionId, toolId, toolName, input } = msg;
    const inputSummary = this.formatToolInput(toolName, input);

    const { InlineKeyboard } = await import('grammy');
    const keyboard = new InlineKeyboard()
      .text('Allow', `approve:${sessionId}:${toolId}`)
      .text('Deny', `deny:${sessionId}:${toolId}`);

    this.bot.api.sendMessage(
      chatId,
      `Tool approval needed:\n*${toolName}*\n${inputSummary}`,
      { parse_mode: 'Markdown', reply_markup: keyboard },
    ).catch(e => console.error('[Telegram] Failed to send approval:', e));
  }

  // ── Private: Text streaming / batching ──

  private appendStreamText(chatId: number, binding: ChatBinding, text: string): void {
    binding.pendingText += text;

    // Reset flush timer
    if (binding.flushTimer) clearTimeout(binding.flushTimer);
    binding.flushTimer = setTimeout(() => {
      this.flushStreamText(chatId, binding);
    }, FLUSH_DELAY_MS);
  }

  private flushStreamText(chatId: number, binding: ChatBinding): void {
    if (binding.flushTimer) {
      clearTimeout(binding.flushTimer);
      binding.flushTimer = null;
    }

    if (!binding.pendingText) return;

    const text = binding.pendingText;
    binding.pendingText = '';
    binding.streamingMsgId = null;

    // Chunk if needed
    this.sendLongMessage(chatId, text);
  }

  // ── Private: Message sending helpers ──

  private sendMessage(chatId: number, text: string, parseMode?: 'Markdown' | 'HTML'): void {
    if (!this.bot) return;
    const opts: any = {};
    if (parseMode) opts.parse_mode = parseMode;
    this.bot.api.sendMessage(chatId, text, opts).catch(e => {
      // If markdown parsing fails, retry without parse mode
      if (parseMode) {
        this.bot?.api.sendMessage(chatId, text).catch(() => {});
      } else {
        console.error('[Telegram] Failed to send message:', e);
      }
    });
  }

  private sendLongMessage(chatId: number, text: string): void {
    if (!this.bot) return;
    // Chunk into Telegram-safe sizes
    const chunks = this.chunkText(text, TELEGRAM_MSG_LIMIT - 100);
    for (const chunk of chunks) {
      // Try Markdown first, fall back to plain text
      this.sendMessage(chatId, chunk, 'Markdown');
    }
  }

  private chunkText(text: string, maxLen: number): string[] {
    if (text.length <= maxLen) return [text];

    const chunks: string[] = [];
    let remaining = text;
    while (remaining.length > 0) {
      if (remaining.length <= maxLen) {
        chunks.push(remaining);
        break;
      }
      // Try to split at a newline
      let splitAt = remaining.lastIndexOf('\n', maxLen);
      if (splitAt < maxLen / 2) splitAt = maxLen;
      chunks.push(remaining.slice(0, splitAt));
      remaining = remaining.slice(splitAt);
    }
    return chunks;
  }

  private formatToolInput(toolName: string, input: Record<string, unknown>): string {
    // Show relevant fields based on tool type
    if (toolName === 'Edit' || toolName === 'Write' || toolName === 'Read') {
      const filePath = input.file_path ?? input.path ?? '';
      return `\`${filePath}\``;
    }
    if (toolName === 'Bash') {
      const cmd = input.command ?? '';
      return `\`${String(cmd).slice(0, 100)}\``;
    }
    if (toolName === 'Glob' || toolName === 'Grep') {
      const pattern = input.pattern ?? '';
      return `Pattern: \`${pattern}\``;
    }
    // Generic: show first key-value
    const keys = Object.keys(input).slice(0, 2);
    return keys.map(k => `${k}: \`${String(input[k]).slice(0, 60)}\``).join('\n');
  }
}
