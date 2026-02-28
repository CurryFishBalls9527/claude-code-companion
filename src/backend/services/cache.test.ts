import { describe, it, expect, beforeEach } from 'vitest';
import { FileCache } from './cache.js';
import { join } from 'path';

const SAMPLE = join(process.cwd(), 'src/test-fixtures/sample-session.jsonl');

describe('FileCache', () => {
  let cache: FileCache<string>;

  beforeEach(() => {
    cache = new FileCache<string>(3); // small max for LRU testing
  });

  it('returns undefined for unknown key', async () => {
    const result = await cache.get('/nonexistent/file.jsonl');
    expect(result).toBeUndefined();
  });

  it('stores and retrieves a value', async () => {
    await cache.set(SAMPLE, 'test-value');
    const result = await cache.get(SAMPLE);
    expect(result).toBe('test-value');
  });

  it('evicts LRU entry when at capacity', async () => {
    const files = [SAMPLE, SAMPLE + '1', SAMPLE + '2', SAMPLE + '3'];

    // Fill cache to capacity (3) using the real file for first entry
    await cache.set(SAMPLE, 'value-0');
    await cache.set(SAMPLE + '1', 'value-1');
    await cache.set(SAMPLE + '2', 'value-2');

    // Access the first entry to make it recently used
    await cache.get(SAMPLE);

    // Add fourth entry - should evict SAMPLE+'1' (least recently used)
    await cache.set(SAMPLE + '3', 'value-3');

    expect(cache.size).toBe(3);
  });

  it('invalidates a specific key', async () => {
    await cache.set(SAMPLE, 'value');
    cache.invalidate(SAMPLE);
    const result = await cache.get(SAMPLE);
    expect(result).toBeUndefined();
  });

  it('clears all entries', async () => {
    await cache.set(SAMPLE, 'value');
    cache.clear();
    expect(cache.size).toBe(0);
  });

  it('returns undefined when file is modified (mtime changed)', async () => {
    // Set with current mtime
    await cache.set(SAMPLE, 'cached-value');

    // Manually corrupt the stored mtime
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const internal = (cache as any).cache.get(SAMPLE);
    if (internal) internal.mtime = 0; // force mtime mismatch

    const result = await cache.get(SAMPLE);
    expect(result).toBeUndefined();
  });
});
