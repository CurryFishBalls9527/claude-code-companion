import { stat } from 'fs/promises';
import { SESSION_CACHE_MAX } from '../../shared/constants.js';

interface CacheEntry<T> {
  value: T;
  mtime: number;
  lastAccessed: number;
}

/**
 * LRU cache keyed by file path, invalidated when file modification time changes.
 */
export class FileCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private maxSize: number;

  constructor(maxSize = SESSION_CACHE_MAX) {
    this.maxSize = maxSize;
  }

  async get(filePath: string): Promise<T | undefined> {
    const entry = this.cache.get(filePath);
    if (!entry) return undefined;

    // Check if file has been modified
    try {
      const s = await stat(filePath);
      if (s.mtimeMs !== entry.mtime) {
        this.cache.delete(filePath);
        return undefined;
      }
    } catch {
      this.cache.delete(filePath);
      return undefined;
    }

    entry.lastAccessed = Date.now();
    return entry.value;
  }

  async set(filePath: string, value: T): Promise<void> {
    let mtime = 0;
    try {
      const s = await stat(filePath);
      mtime = s.mtimeMs;
    } catch {
      // Use 0 as mtime if file not found
    }

    // Evict LRU entry if at capacity
    if (this.cache.size >= this.maxSize && !this.cache.has(filePath)) {
      let lruKey = '';
      let lruTime = Infinity;
      for (const [key, entry] of this.cache) {
        if (entry.lastAccessed < lruTime) {
          lruTime = entry.lastAccessed;
          lruKey = key;
        }
      }
      if (lruKey) this.cache.delete(lruKey);
    }

    this.cache.set(filePath, { value, mtime, lastAccessed: Date.now() });
  }

  invalidate(filePath: string): void {
    this.cache.delete(filePath);
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}

// Singleton caches
import type { SessionSummary, SessionDetail } from '../../shared/types.js';
export const summaryCache = new FileCache<SessionSummary>();
export const detailCache = new FileCache<SessionDetail>();
