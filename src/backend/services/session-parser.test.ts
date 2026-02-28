import { describe, it, expect } from 'vitest';
import { parseSessionSummary, parseSessionDetail } from './session-parser.js';
import { join } from 'path';

const FIXTURES = join(process.cwd(), 'src/test-fixtures');
const SAMPLE = join(FIXTURES, 'sample-session.jsonl');
const EMPTY = join(FIXTURES, 'empty-session.jsonl');

describe('parseSessionSummary', () => {
  it('extracts session ID from file path', async () => {
    const summary = await parseSessionSummary(SAMPLE);
    expect(summary.id).toBe('sample-session');
  });

  it('counts user and assistant messages', async () => {
    const summary = await parseSessionSummary(SAMPLE);
    // 4 user + 4 assistant = 8 messages (not counting meta/tool-result-only)
    expect(summary.messageCount).toBeGreaterThan(0);
  });

  it('counts tool calls correctly', async () => {
    const summary = await parseSessionSummary(SAMPLE);
    expect(summary.toolCallCount).toBe(2); // Write + Edit
  });

  it('counts edit operations correctly', async () => {
    const summary = await parseSessionSummary(SAMPLE);
    expect(summary.editCount).toBe(2); // Write + Edit both count
  });

  it('extracts timestamps', async () => {
    const summary = await parseSessionSummary(SAMPLE);
    expect(summary.firstTimestamp).toBe('2024-01-15T10:00:00.000Z');
    expect(summary.lastTimestamp).toBe('2024-01-15T10:00:25.000Z');
  });

  it('calculates duration in milliseconds', async () => {
    const summary = await parseSessionSummary(SAMPLE);
    expect(summary.durationMs).toBe(25000); // 25 seconds
  });

  it('sums token usage across all assistant messages', async () => {
    const summary = await parseSessionSummary(SAMPLE);
    expect(summary.tokenUsage.input_tokens).toBe(150 + 200 + 250 + 300);
    expect(summary.tokenUsage.output_tokens).toBe(80 + 40 + 60 + 30);
  });

  it('extracts the first user prompt', async () => {
    const summary = await parseSessionSummary(SAMPLE);
    expect(summary.firstUserPrompt).toBe('Write a hello world function in Python');
  });

  it('detects model from assistant messages', async () => {
    const summary = await parseSessionSummary(SAMPLE);
    expect(summary.model).toBe('claude-sonnet-4-5');
  });

  it('extracts git branch', async () => {
    const summary = await parseSessionSummary(SAMPLE);
    expect(summary.gitBranch).toBe('main');
  });

  it('calculates estimated cost', async () => {
    const summary = await parseSessionSummary(SAMPLE);
    expect(summary.estimatedCost).toBeGreaterThan(0);
  });

  it('handles empty session gracefully', async () => {
    const summary = await parseSessionSummary(EMPTY);
    expect(summary.messageCount).toBe(0);
    expect(summary.toolCallCount).toBe(0);
  });
});

describe('parseSessionDetail', () => {
  it('returns summary fields + messages array', async () => {
    const detail = await parseSessionDetail(SAMPLE);
    expect(detail.messages).toBeDefined();
    expect(Array.isArray(detail.messages)).toBe(true);
  });

  it('includes assistant text in messages', async () => {
    const detail = await parseSessionDetail(SAMPLE);
    const assistantMsgs = detail.messages.filter((m) => m.role === 'assistant');
    expect(assistantMsgs.length).toBeGreaterThan(0);
    const withText = assistantMsgs.filter((m) => m.text);
    expect(withText.length).toBeGreaterThan(0);
  });

  it('extracts thinking blocks', async () => {
    const detail = await parseSessionDetail(SAMPLE);
    const withThinking = detail.messages.filter((m) => m.thinking);
    expect(withThinking.length).toBeGreaterThan(0);
    expect(withThinking[0].thinking).toContain('hello world');
  });

  it('extracts tool calls from assistant messages', async () => {
    const detail = await parseSessionDetail(SAMPLE);
    const withTools = detail.messages.filter((m) => m.toolCalls && m.toolCalls.length > 0);
    expect(withTools.length).toBe(2);
  });

  it('matches tool_result back to tool_use by ID', async () => {
    const detail = await parseSessionDetail(SAMPLE);
    const assistantMsgs = detail.messages.filter((m) => m.role === 'assistant' && m.toolCalls?.length);

    // Tool results should be populated on the tool call objects
    const writeCall = assistantMsgs[0]?.toolCalls?.find((tc) => tc.name === 'Write');
    expect(writeCall?.result).toBe('File written successfully');

    const editCall = assistantMsgs[1]?.toolCalls?.find((tc) => tc.name === 'Edit');
    expect(editCall?.result).toBe('Edit applied successfully');
  });

  it('includes user messages with text', async () => {
    const detail = await parseSessionDetail(SAMPLE);
    const userMsgs = detail.messages.filter((m) => m.role === 'user' && m.userText);
    expect(userMsgs.length).toBeGreaterThan(0);
    expect(userMsgs[0].userText).toBe('Write a hello world function in Python');
  });

  it('skips tool-result-only user messages from message list (they are merged into tool calls)', async () => {
    const detail = await parseSessionDetail(SAMPLE);
    // User messages with only tool_result content should not appear as standalone messages
    const pureToolResultMsgs = detail.messages.filter(
      (m) => m.role === 'user' && !m.userText && (!m.toolResults || m.toolResults.length === 0)
    );
    expect(pureToolResultMsgs.length).toBe(0);
  });
});
