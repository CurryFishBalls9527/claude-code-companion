import type { StreamEvent } from '../../shared/types.js';

/**
 * Parses newline-delimited JSON from Claude Code's --output-format stream-json.
 * Buffers incomplete lines across multiple PTY data chunks.
 */
export class ProtocolParser {
  private buffer = '';

  feed(chunk: string): StreamEvent[] {
    this.buffer += chunk;
    const events: StreamEvent[] = [];
    const lines = this.buffer.split('\n');
    // Keep the last (potentially incomplete) line in the buffer
    this.buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      // Skip ANSI escape sequences or other non-JSON output
      if (!trimmed.startsWith('{')) continue;
      try {
        events.push(JSON.parse(trimmed) as StreamEvent);
      } catch {
        // Malformed line — skip silently
      }
    }

    return events;
  }

  /** Flush remaining buffer (call on session end) */
  flush(): StreamEvent[] {
    const result = this.feed('\n');
    this.buffer = '';
    return result;
  }
}
