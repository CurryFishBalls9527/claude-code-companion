import { homedir } from 'os';
import { join } from 'path';

export const CLAUDE_HOME = join(homedir(), '.claude');
export const PROJECTS_DIR = join(CLAUDE_HOME, 'projects');
export const HISTORY_FILE = join(CLAUDE_HOME, 'history.jsonl');
export const STATS_CACHE_FILE = join(CLAUDE_HOME, 'stats-cache.json');
export const FILE_HISTORY_DIR = join(CLAUDE_HOME, 'file-history');

// Cost per million tokens (input, output) in USD
// Sources: Anthropic pricing page
export const MODEL_PRICING: Record<string, { input: number; output: number; cacheRead?: number; cacheWrite?: number }> = {
  'claude-opus-4-6': { input: 15, output: 75, cacheRead: 1.5, cacheWrite: 18.75 },
  'claude-opus-4-5': { input: 15, output: 75, cacheRead: 1.5, cacheWrite: 18.75 },
  'claude-sonnet-4-6': { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  'claude-sonnet-4-5': { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  'claude-sonnet-3-7': { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  'claude-haiku-4-5': { input: 0.8, output: 4, cacheRead: 0.08, cacheWrite: 1 },
  'claude-haiku-3-5': { input: 0.8, output: 4, cacheRead: 0.08, cacheWrite: 1 },
  'claude-haiku-3': { input: 0.25, output: 1.25, cacheRead: 0.03, cacheWrite: 0.3 },
  // Fallback for unknown models
  'default': { input: 3, output: 15 },
};

export const BACKEND_PORT = 3456;
export const FRONTEND_PORT = 5173;

export const SESSION_CACHE_MAX = 50;
export const SEARCH_SNIPPET_LENGTH = 200;
