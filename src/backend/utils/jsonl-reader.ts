import { createReadStream } from 'fs';
import { createInterface } from 'readline';
import { stat } from 'fs/promises';
import type { RawSessionEntry } from '../../shared/types.js';

/**
 * Async generator that yields parsed JSONL entries from a file.
 * Skips malformed lines silently.
 */
export async function* readJsonl(filePath: string): AsyncGenerator<RawSessionEntry> {
  let stream;
  try {
    stream = createReadStream(filePath, { encoding: 'utf-8' });
  } catch {
    return;
  }
  const rl = createInterface({ input: stream, crlfDelay: Infinity });
  // Handle stream errors (e.g. ENOENT) gracefully
  let streamError = false;
  stream.on('error', () => { streamError = true; rl.close(); });

  try {
    for await (const line of rl) {
      if (streamError) break;
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        yield JSON.parse(trimmed) as RawSessionEntry;
      } catch {
        // Skip malformed lines
      }
    }
  } catch {
    // Stream closed due to error
  }
}

/**
 * Read all entries from a JSONL file into an array.
 */
export async function readJsonlAll(filePath: string): Promise<RawSessionEntry[]> {
  const entries: RawSessionEntry[] = [];
  for await (const entry of readJsonl(filePath)) {
    entries.push(entry);
  }
  return entries;
}

export interface TailResult {
  entries: RawSessionEntry[];
  newOffset: number;
}

/**
 * Read new JSONL entries from a byte offset (for live/tail mode).
 * Returns parsed entries and the new file byte offset.
 */
export async function readJsonlTail(filePath: string, fromByte: number = 0): Promise<TailResult> {
  const entries: RawSessionEntry[] = [];

  let fileSize: number;
  try {
    const s = await stat(filePath);
    fileSize = s.size;
  } catch {
    return { entries, newOffset: fromByte };
  }

  if (fileSize <= fromByte) {
    return { entries, newOffset: fromByte };
  }

  const stream = createReadStream(filePath, {
    encoding: 'utf-8',
    start: fromByte
  });

  const rl = createInterface({ input: stream, crlfDelay: Infinity });
  let bytesRead = 0;

  for await (const line of rl) {
    const lineBytes = Buffer.byteLength(line + '\n', 'utf-8');
    bytesRead += lineBytes;

    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      entries.push(JSON.parse(trimmed) as RawSessionEntry);
    } catch {
      // Skip malformed lines
    }
  }

  return { entries, newOffset: fromByte + bytesRead };
}

/**
 * Get the current file size in bytes (used as initial offset for tail mode).
 */
export async function getFileSize(filePath: string): Promise<number> {
  try {
    const s = await stat(filePath);
    return s.size;
  } catch {
    return 0;
  }
}
