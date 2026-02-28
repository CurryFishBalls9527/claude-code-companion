import { createPatch } from 'diff';
import type { ProcessedToolCall, FileDiff } from '../../shared/types.js';

/**
 * Extract file diffs from tool calls (Edit and Write operations).
 */
export function extractDiffs(sessionId: string, toolCalls: Array<{ toolCall: ProcessedToolCall; timestamp: string }>): FileDiff[] {
  const diffs: FileDiff[] = [];

  for (const { toolCall, timestamp } of toolCalls) {
    if (toolCall.name === 'Edit') {
      const filePath = String(toolCall.input.file_path ?? '');
      const oldString = String(toolCall.input.old_string ?? '');
      const newString = String(toolCall.input.new_string ?? '');

      const unifiedDiff = createPatch(
        filePath,
        oldString,
        newString,
        'old',
        'new'
      );

      const { added, removed } = countDiffLines(unifiedDiff);

      diffs.push({
        sessionId,
        toolCallId: toolCall.id,
        toolName: 'Edit',
        filePath,
        unifiedDiff,
        linesAdded: added,
        linesRemoved: removed,
        timestamp,
      });
    } else if (toolCall.name === 'Write') {
      const filePath = String(toolCall.input.file_path ?? '');
      const content = String(toolCall.input.content ?? '');

      // All-additions diff
      const unifiedDiff = createPatch(filePath, '', content, 'empty', 'new');
      const lines = content.split('\n').length;

      diffs.push({
        sessionId,
        toolCallId: toolCall.id,
        toolName: 'Write',
        filePath,
        unifiedDiff,
        linesAdded: lines,
        linesRemoved: 0,
        timestamp,
      });
    }
  }

  return diffs;
}

function countDiffLines(unifiedDiff: string): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const line of unifiedDiff.split('\n')) {
    if (line.startsWith('+') && !line.startsWith('+++')) added++;
    else if (line.startsWith('-') && !line.startsWith('---')) removed++;
  }
  return { added, removed };
}

/**
 * Extract tool calls with timestamps from a session's messages for diff extraction.
 */
export function extractToolCallsWithTimestamps(
  messages: Array<{ toolCalls?: ProcessedToolCall[]; timestamp: string }>
): Array<{ toolCall: ProcessedToolCall; timestamp: string }> {
  const result: Array<{ toolCall: ProcessedToolCall; timestamp: string }> = [];
  for (const msg of messages) {
    for (const tc of msg.toolCalls ?? []) {
      result.push({ toolCall: tc, timestamp: msg.timestamp });
    }
  }
  return result;
}
