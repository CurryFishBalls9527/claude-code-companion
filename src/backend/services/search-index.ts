import { discoverProjects, discoverSessions, getSessionPath } from './claude-data.js';
import { readJsonlAll } from '../utils/jsonl-reader.js';
import { SEARCH_SNIPPET_LENGTH } from '../../shared/constants.js';
import type { SearchResult, ContentBlock } from '../../shared/types.js';

/**
 * Simple substring search across all session JSONL files.
 * Returns up to `limit` results.
 */
export async function searchSessions(
  query: string,
  projectHash?: string,
  limit = 20
): Promise<SearchResult[]> {
  if (!query || query.trim().length < 2) return [];

  const q = query.toLowerCase();
  const results: SearchResult[] = [];
  const projects = await discoverProjects();

  const filteredProjects = projectHash
    ? projects.filter((p) => p.hash === projectHash)
    : projects;

  outer: for (const project of filteredProjects) {
    const sessions = await discoverSessions(project.hash);
    for (const sessionFile of sessions) {
      const filePath = getSessionPath(project.hash, sessionFile);
      let entries;
      try {
        entries = await readJsonlAll(filePath);
      } catch {
        continue;
      }

      const sessionId = sessionFile.replace('.jsonl', '');

      for (const entry of entries) {
        if (results.length >= limit) break outer;

        const match = searchEntry(entry, q);
        if (!match) continue;

        results.push({
          sessionId,
          projectName: project.name,
          timestamp: entry.timestamp,
          matchType: match.type,
          snippet: createSnippet(match.text, q),
          score: 1,
        });
      }
    }
  }

  return results;
}

interface EntryMatch {
  type: SearchResult['matchType'];
  text: string;
}

function searchEntry(entry: object, q: string): EntryMatch | null {
  const e = entry as Record<string, unknown>;
  const type = e.type as string;
  const message = e.message as { role?: string; content?: string | ContentBlock[] } | undefined;

  if (type === 'user' && message?.role === 'user') {
    const content = message.content;
    const text = typeof content === 'string'
      ? content
      : Array.isArray(content)
        ? content.filter((b: ContentBlock) => b.type === 'text').map((b: ContentBlock) => b.text ?? '').join(' ')
        : '';
    if (text.toLowerCase().includes(q)) {
      return { type: 'user-prompt', text };
    }
  }

  if (type === 'assistant' && message?.role === 'assistant') {
    const content = message.content as ContentBlock[] | undefined;
    if (Array.isArray(content)) {
      for (const block of content) {
        if (block.type === 'text' && block.text?.toLowerCase().includes(q)) {
          return { type: 'assistant-response', text: block.text };
        }
        if (block.type === 'tool_use') {
          const inputStr = JSON.stringify(block.input ?? '');
          if (inputStr.toLowerCase().includes(q)) {
            return { type: 'tool-call', text: `${block.name}: ${inputStr}` };
          }
        }
      }
    }
  }

  return null;
}

function createSnippet(text: string, query: string): string {
  const idx = text.toLowerCase().indexOf(query);
  if (idx === -1) return text.slice(0, SEARCH_SNIPPET_LENGTH);

  const start = Math.max(0, idx - 80);
  const end = Math.min(text.length, idx + query.length + 80);
  let snippet = text.slice(start, end);
  if (start > 0) snippet = '...' + snippet;
  if (end < text.length) snippet = snippet + '...';
  return snippet;
}
