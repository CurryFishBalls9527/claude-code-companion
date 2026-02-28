import { readJsonlAll } from '../utils/jsonl-reader.js';
import { calculateCost, sumUsage } from '../utils/cost-calculator.js';
import { hashToPath, pathToName } from './claude-data.js';
import { basename } from 'path';
import type {
  RawSessionEntry,
  ProcessedMessage,
  ProcessedToolCall,
  SessionSummary,
  SessionDetail,
  ContentBlock,
  TokenUsage,
} from '../../shared/types.js';

/**
 * Extract the project hash from a session file path.
 * Path format: ~/.claude/projects/<hash>/<sessionId>.jsonl
 */
function extractProjectHash(filePath: string): string {
  const parts = filePath.split('/');
  const projectsIdx = parts.indexOf('projects');
  return projectsIdx >= 0 ? (parts[projectsIdx + 1] ?? '') : '';
}

/**
 * Extract text content from user message content (string or ContentBlock[]).
 */
function extractUserText(content: string | ContentBlock[]): string {
  if (typeof content === 'string') return content;
  return content
    .filter((b) => b.type === 'text' && b.text)
    .map((b) => b.text ?? '')
    .join('\n')
    .trim();
}

/**
 * Quick parse of a session file to produce a SessionSummary.
 * Streams the file without keeping everything in memory.
 */
export async function parseSessionSummary(filePath: string): Promise<SessionSummary> {
  const sessionId = basename(filePath, '.jsonl');
  const projectHash = extractProjectHash(filePath);
  const projectPath = hashToPath(projectHash);
  const projectName = pathToName(projectPath);

  let firstTimestamp = '';
  let lastTimestamp = '';
  let messageCount = 0;
  let toolCallCount = 0;
  let editCount = 0;
  let totalUsage: TokenUsage = { input_tokens: 0, output_tokens: 0 };
  let firstUserPrompt = '';
  let model = '';
  let gitBranch: string | undefined;
  const prLinks: string[] = [];

  const entries = await readJsonlAll(filePath);

  for (const entry of entries) {
    if (!entry.timestamp) continue;
    if (!firstTimestamp) firstTimestamp = entry.timestamp;
    lastTimestamp = entry.timestamp;

    if (entry.gitBranch && !gitBranch) gitBranch = entry.gitBranch;

    if (entry.type === 'pr-link' && entry.url) {
      prLinks.push(entry.url);
    }

    if (entry.type === 'user') {
      const msg = entry.message as { role: string; content: string | ContentBlock[] } | undefined;
      if (msg?.role === 'user' && !entry.isMeta) {
        messageCount++;
        if (!firstUserPrompt) {
          const text = extractUserText(msg.content);
          // Skip system/command messages for first prompt
          if (text && !text.startsWith('<') && !text.includes('<local-command')) {
            firstUserPrompt = text.slice(0, 200);
          }
        }
      }
    }

    if (entry.type === 'assistant') {
      messageCount++;
      const msg = entry.message as { role: string; content: ContentBlock[]; model?: string; usage?: TokenUsage } | undefined;
      if (!msg) continue;

      if (msg.model && !model) model = msg.model;
      if (msg.usage) totalUsage = sumUsage(totalUsage, msg.usage);

      for (const block of msg.content ?? []) {
        if (block.type === 'tool_use') {
          toolCallCount++;
          if (block.name === 'Edit' || block.name === 'Write') editCount++;
        }
      }
    }
  }

  const firstDate = firstTimestamp ? new Date(firstTimestamp).getTime() : 0;
  const lastDate = lastTimestamp ? new Date(lastTimestamp).getTime() : 0;
  const durationMs = lastDate - firstDate;
  const estimatedCost = calculateCost(totalUsage, model);

  return {
    id: sessionId,
    filePath,
    projectHash,
    projectName,
    projectPath,
    firstTimestamp,
    lastTimestamp,
    durationMs,
    messageCount,
    toolCallCount,
    editCount,
    tokenUsage: totalUsage,
    estimatedCost,
    firstUserPrompt: firstUserPrompt || '(no prompt)',
    model: model || 'unknown',
    gitBranch,
    prLinks,
  };
}

/**
 * Full parse of a session file into ProcessedMessage[].
 */
export async function parseSessionDetail(filePath: string): Promise<SessionDetail> {
  const summary = await parseSessionSummary(filePath);
  const entries = await readJsonlAll(filePath);
  const messages = processEntries(entries);

  return { ...summary, messages };
}

/**
 * Convert raw JSONL entries to ProcessedMessages, matching tool_results back to tool_use blocks.
 */
function processEntries(entries: RawSessionEntry[]): ProcessedMessage[] {
  const messages: ProcessedMessage[] = [];

  // Map from tool_use_id -> ProcessedToolCall reference for result matching
  const pendingToolCalls = new Map<string, ProcessedToolCall>();

  for (const entry of entries) {
    if (entry.type === 'progress' || entry.type === 'file-history-snapshot' || entry.type === 'queue-operation') {
      continue; // Skip non-conversational entries
    }

    if (entry.type === 'summary') {
      continue; // Skip summary entries for now
    }

    if (entry.type === 'pr-link') {
      continue; // Captured in summary already
    }

    if (entry.type === 'user') {
      const msg = entry.message as { role: string; content: string | ContentBlock[] } | undefined;
      if (!msg) continue;

      // @ts-ignore - isMeta is an extra field
      if (entry.isMeta) continue;

      const content = msg.content;
      const toolResults: ProcessedToolCall[] = [];
      let userText = '';

      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === 'tool_result') {
            const resultText = typeof block.content === 'string'
              ? block.content
              : Array.isArray(block.content)
                ? block.content.map((b) => (b as ContentBlock).text ?? '').join('\n')
                : '';

            const toolCall = pendingToolCalls.get(block.tool_use_id ?? '');
            if (toolCall) {
              toolCall.result = resultText.slice(0, 10000); // Limit result size
              toolCall.isError = block.is_error;
              pendingToolCalls.delete(block.tool_use_id ?? '');
            } else {
              // Orphaned tool result (shouldn't happen normally)
              toolResults.push({
                id: block.tool_use_id ?? 'unknown',
                name: 'unknown',
                input: {},
                result: resultText.slice(0, 10000),
                isError: block.is_error,
              });
            }
          } else if (block.type === 'text') {
            userText += block.text ?? '';
          }
        }
      } else if (typeof content === 'string') {
        userText = content;
      }

      // Skip pure system messages
      if (!userText && toolResults.length === 0) continue;
      // Skip command/system messages
      if (userText.startsWith('<local-command') || userText.startsWith('<command-name>')) continue;

      messages.push({
        uuid: entry.uuid,
        parentUuid: entry.parentUuid,
        timestamp: entry.timestamp,
        role: 'user',
        userText: userText.trim() || undefined,
        toolResults: toolResults.length > 0 ? toolResults : undefined,
      });
    }

    if (entry.type === 'assistant') {
      const msg = entry.message as { role: string; content: ContentBlock[]; model?: string; usage?: TokenUsage } | undefined;
      if (!msg) continue;

      let thinking: string | undefined;
      let text: string | undefined;
      const toolCalls: ProcessedToolCall[] = [];

      for (const block of msg.content ?? []) {
        if (block.type === 'thinking') {
          thinking = block.thinking ?? block.text ?? '';
        } else if (block.type === 'text') {
          text = (text ?? '') + (block.text ?? '');
        } else if (block.type === 'tool_use') {
          const tc: ProcessedToolCall = {
            id: block.id ?? '',
            name: block.name ?? '',
            input: (block.input ?? {}) as Record<string, unknown>,
          };
          toolCalls.push(tc);
          if (block.id) pendingToolCalls.set(block.id, tc);
        }
      }

      messages.push({
        uuid: entry.uuid,
        parentUuid: entry.parentUuid,
        timestamp: entry.timestamp,
        role: 'assistant',
        thinking: thinking?.trim() || undefined,
        text: text?.trim() || undefined,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        model: msg.model,
        usage: msg.usage,
      });
    }
  }

  return messages;
}
