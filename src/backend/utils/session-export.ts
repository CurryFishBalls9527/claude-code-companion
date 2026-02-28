import type { SessionDetail, ProcessedMessage } from '../../shared/types.js';

export function sessionToMarkdown(detail: SessionDetail): string {
  const lines: string[] = [];

  lines.push(`# Session: ${detail.id}`);
  lines.push('');
  lines.push(`**Project**: ${detail.projectName} (\`${detail.projectPath}\`)`);
  if (detail.gitBranch && detail.gitBranch !== 'HEAD') {
    lines.push(`**Branch**: \`${detail.gitBranch}\``);
  }
  lines.push(`**Started**: ${new Date(detail.firstTimestamp).toLocaleString()}`);
  lines.push(`**Duration**: ${formatDuration(detail.durationMs)}`);
  lines.push(`**Messages**: ${detail.messageCount} | **Tool calls**: ${detail.toolCallCount} | **Edits**: ${detail.editCount}`);
  lines.push(`**Tokens**: ${(detail.tokenUsage.input_tokens + detail.tokenUsage.output_tokens).toLocaleString()} | **Est. cost**: $${detail.estimatedCost.toFixed(4)}`);
  if (detail.prLinks.length > 0) {
    lines.push(`**PR Links**: ${detail.prLinks.join(', ')}`);
  }
  lines.push('');
  lines.push('---');
  lines.push('');

  for (const msg of detail.messages) {
    lines.push(...messageToMarkdown(msg));
  }

  return lines.join('\n');
}

function messageToMarkdown(msg: ProcessedMessage): string[] {
  const lines: string[] = [];
  const ts = new Date(msg.timestamp).toLocaleTimeString();

  if (msg.role === 'user') {
    lines.push(`## 👤 User — ${ts}`);
    lines.push('');
    if (msg.userText) {
      lines.push(msg.userText);
      lines.push('');
    }
  }

  if (msg.role === 'assistant') {
    lines.push(`## 🤖 Claude — ${ts}${msg.model ? ` (${msg.model})` : ''}`);
    lines.push('');

    if (msg.thinking) {
      lines.push('<details>');
      lines.push('<summary>Thinking</summary>');
      lines.push('');
      lines.push(msg.thinking);
      lines.push('');
      lines.push('</details>');
      lines.push('');
    }

    if (msg.text) {
      lines.push(msg.text);
      lines.push('');
    }

    for (const tc of msg.toolCalls ?? []) {
      lines.push(`### 🔧 ${tc.name}`);
      lines.push('');
      lines.push('```json');
      lines.push(JSON.stringify(tc.input, null, 2));
      lines.push('```');
      if (tc.result) {
        lines.push('');
        lines.push('**Result:**');
        lines.push('```');
        lines.push(tc.result.slice(0, 2000));
        if (tc.result.length > 2000) lines.push('... (truncated)');
        lines.push('```');
      }
      lines.push('');
    }
  }

  return lines;
}

function formatDuration(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
  return `${(ms / 3_600_000).toFixed(1)}h`;
}
