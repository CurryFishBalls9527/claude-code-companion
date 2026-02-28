import chokidar from 'chokidar';
import { PROJECTS_DIR } from '../../shared/constants.js';
import { readJsonlTail, getFileSize } from '../utils/jsonl-reader.js';
import type { RawSessionEntry } from '../../shared/types.js';

type UpdateCallback = (entries: RawSessionEntry[]) => void;

interface WatchedFile {
  offset: number;
  subscribers: Set<UpdateCallback>;
}

const watchedFiles = new Map<string, WatchedFile>();
let watcher: ReturnType<typeof chokidar.watch> | null = null;

/**
 * Start watching ~/.claude/projects/ for new JSONL entries.
 */
export function startFileWatcher(): void {
  if (watcher) return;

  watcher = chokidar.watch(`${PROJECTS_DIR}/**/*.jsonl`, {
    ignoreInitial: true,
    persistent: true,
    awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 },
  });

  watcher.on('change', async (filePath: string) => {
    const watched = watchedFiles.get(filePath);
    if (!watched || watched.subscribers.size === 0) return;

    const { entries, newOffset } = await readJsonlTail(filePath, watched.offset);
    if (entries.length === 0) return;

    watched.offset = newOffset;
    for (const cb of watched.subscribers) {
      try {
        cb(entries);
      } catch {
        // Ignore callback errors
      }
    }
  });

  watcher.on('add', (filePath: string) => {
    // New session file created - initialize with offset 0
    if (!watchedFiles.has(filePath)) {
      watchedFiles.set(filePath, { offset: 0, subscribers: new Set() });
    }
  });

  console.log('[FileWatcher] Started watching', PROJECTS_DIR);
}

/**
 * Subscribe to updates for a specific session file.
 * Returns an unsubscribe function.
 */
export async function subscribeToSession(
  filePath: string,
  callback: UpdateCallback
): Promise<() => void> {
  if (!watchedFiles.has(filePath)) {
    const offset = await getFileSize(filePath);
    watchedFiles.set(filePath, { offset, subscribers: new Set() });
  }

  const watched = watchedFiles.get(filePath)!;
  watched.subscribers.add(callback);

  return () => {
    watched.subscribers.delete(callback);
    if (watched.subscribers.size === 0) {
      watchedFiles.delete(filePath);
    }
  };
}

/**
 * Find the most recently modified session file across all projects.
 * Used to detect the "active" session for the live monitor.
 */
export async function findMostRecentSessionFile(): Promise<string | null> {
  const { readdir, stat } = await import('fs/promises');
  const { join } = await import('path');

  let mostRecent: { path: string; mtime: number } | null = null;

  let projectHashes: string[];
  try {
    projectHashes = await readdir(PROJECTS_DIR);
  } catch {
    return null;
  }

  for (const hash of projectHashes) {
    const projectDir = join(PROJECTS_DIR, hash);
    let files: string[];
    try {
      files = await readdir(projectDir);
    } catch {
      continue;
    }

    for (const file of files) {
      if (!file.endsWith('.jsonl') || file.startsWith('agent-')) continue;
      const filePath = join(projectDir, file);
      try {
        const s = await stat(filePath);
        if (!mostRecent || s.mtimeMs > mostRecent.mtime) {
          mostRecent = { path: filePath, mtime: s.mtimeMs };
        }
      } catch {
        continue;
      }
    }
  }

  return mostRecent?.path ?? null;
}

/**
 * Stop the file watcher.
 */
export async function stopFileWatcher(): Promise<void> {
  if (watcher) {
    await watcher.close();
    watcher = null;
    watchedFiles.clear();
  }
}
