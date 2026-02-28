import { describe, it, expect } from 'vitest';
import { readJsonlAll, readJsonlTail, getFileSize } from './jsonl-reader.js';
import { join } from 'path';

const FIXTURES = join(process.cwd(), 'src/test-fixtures');
const SAMPLE = join(FIXTURES, 'sample-session.jsonl');
const EMPTY = join(FIXTURES, 'empty-session.jsonl');
const MALFORMED = join(FIXTURES, 'malformed-lines.jsonl');

describe('readJsonlAll', () => {
  it('reads all valid entries from a well-formed file', async () => {
    const entries = await readJsonlAll(SAMPLE);
    expect(entries.length).toBe(8);
  });

  it('returns empty array for non-existent file', async () => {
    const entries = await readJsonlAll('/nonexistent/path.jsonl');
    expect(entries).toEqual([]);
  });

  it('skips malformed lines and reads the valid ones', async () => {
    const entries = await readJsonlAll(MALFORMED);
    expect(entries.length).toBe(3); // 3 valid lines, 1 blank, 1 malformed
  });

  it('reads entry types correctly', async () => {
    const entries = await readJsonlAll(SAMPLE);
    const types = entries.map((e) => e.type);
    expect(types).toContain('user');
    expect(types).toContain('assistant');
  });
});

describe('readJsonlTail', () => {
  it('returns all entries when fromByte is 0', async () => {
    const { entries } = await readJsonlTail(SAMPLE, 0);
    expect(entries.length).toBe(8);
  });

  it('returns empty entries when fromByte equals file size', async () => {
    const size = await getFileSize(SAMPLE);
    const { entries, newOffset } = await readJsonlTail(SAMPLE, size);
    expect(entries).toEqual([]);
    expect(newOffset).toBe(size);
  });

  it('returns new entries from mid-file offset', async () => {
    const { newOffset: firstOffset } = await readJsonlTail(SAMPLE, 0);
    // Simulate reading from partway through the file
    const halfOffset = Math.floor(firstOffset / 2);
    const { entries } = await readJsonlTail(SAMPLE, halfOffset);
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.length).toBeLessThan(8);
  });

  it('returns 0 newOffset for non-existent file', async () => {
    const { entries, newOffset } = await readJsonlTail('/nonexistent.jsonl', 0);
    expect(entries).toEqual([]);
    expect(newOffset).toBe(0);
  });
});

describe('getFileSize', () => {
  it('returns the correct file size in bytes', async () => {
    const size = await getFileSize(SAMPLE);
    expect(size).toBeGreaterThan(0);
  });

  it('returns 0 for non-existent file', async () => {
    const size = await getFileSize('/nonexistent.jsonl');
    expect(size).toBe(0);
  });
});
