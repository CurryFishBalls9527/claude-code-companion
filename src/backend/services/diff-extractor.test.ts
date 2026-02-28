import { describe, it, expect } from 'vitest';
import { extractDiffs } from './diff-extractor.js';
import type { ProcessedToolCall } from '../../shared/types.js';

const SESSION_ID = 'test-session';
const TS = '2024-01-15T10:00:00.000Z';

function makeToolCall(overrides: Partial<ProcessedToolCall>): { toolCall: ProcessedToolCall; timestamp: string } {
  return {
    toolCall: {
      id: 'tc-1',
      name: 'Edit',
      input: {},
      ...overrides,
    },
    timestamp: TS,
  };
}

describe('extractDiffs - Edit tool', () => {
  it('generates a unified diff for an Edit tool call', () => {
    const diffs = extractDiffs(SESSION_ID, [
      makeToolCall({
        name: 'Edit',
        input: {
          file_path: 'src/hello.py',
          old_string: "def hello():\n    print('Hello, World!')",
          new_string: "def hello(name='World'):\n    print(f'Hello, {name}!')",
        },
      }),
    ]);

    expect(diffs).toHaveLength(1);
    expect(diffs[0].toolName).toBe('Edit');
    expect(diffs[0].filePath).toBe('src/hello.py');
    expect(diffs[0].unifiedDiff).toContain('---');
    expect(diffs[0].unifiedDiff).toContain('+++');
    expect(diffs[0].unifiedDiff).toContain("-def hello():");
    expect(diffs[0].unifiedDiff).toContain("+def hello(name='World'):");
  });

  it('counts added and removed lines', () => {
    const diffs = extractDiffs(SESSION_ID, [
      makeToolCall({
        name: 'Edit',
        input: {
          file_path: 'file.txt',
          old_string: 'line1\nline2\nline3',
          new_string: 'line1\nnew_line2\nline3\nline4',
        },
      }),
    ]);

    // diff lib counts: -line2 -line3 (no newline), +new_line2 +line3 +line4 (no newline)
    expect(diffs[0].linesAdded).toBe(3);
    expect(diffs[0].linesRemoved).toBe(2);
  });

  it('attaches sessionId, toolCallId, and timestamp', () => {
    const diffs = extractDiffs(SESSION_ID, [
      makeToolCall({
        id: 'tc-999',
        name: 'Edit',
        input: { file_path: 'f.ts', old_string: 'old', new_string: 'new' },
      }),
    ]);

    expect(diffs[0].sessionId).toBe(SESSION_ID);
    expect(diffs[0].toolCallId).toBe('tc-999');
    expect(diffs[0].timestamp).toBe(TS);
  });
});

describe('extractDiffs - Write tool', () => {
  it('generates an all-additions diff for a Write tool call', () => {
    const diffs = extractDiffs(SESSION_ID, [
      makeToolCall({
        name: 'Write',
        input: {
          file_path: 'new-file.py',
          content: 'def main():\n    pass\n',
        },
      }),
    ]);

    expect(diffs).toHaveLength(1);
    expect(diffs[0].toolName).toBe('Write');
    expect(diffs[0].linesRemoved).toBe(0);
    expect(diffs[0].linesAdded).toBeGreaterThan(0);
  });
});

describe('extractDiffs - mixed calls', () => {
  it('only processes Edit and Write calls, ignores others', () => {
    const diffs = extractDiffs(SESSION_ID, [
      makeToolCall({ name: 'Read', input: { file_path: 'x.ts' } }),
      makeToolCall({ name: 'Bash', input: { command: 'ls' } }),
      makeToolCall({ name: 'Write', input: { file_path: 'out.txt', content: 'hello' } }),
    ]);

    expect(diffs).toHaveLength(1);
    expect(diffs[0].toolName).toBe('Write');
  });

  it('processes multiple Edit calls in order', () => {
    const diffs = extractDiffs(SESSION_ID, [
      makeToolCall({ id: 'tc-1', name: 'Edit', input: { file_path: 'a.ts', old_string: 'a', new_string: 'b' } }),
      makeToolCall({ id: 'tc-2', name: 'Edit', input: { file_path: 'b.ts', old_string: 'c', new_string: 'd' } }),
    ]);

    expect(diffs).toHaveLength(2);
    expect(diffs[0].filePath).toBe('a.ts');
    expect(diffs[1].filePath).toBe('b.ts');
  });
});
