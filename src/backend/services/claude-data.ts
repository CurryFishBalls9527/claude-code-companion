import { readdir, stat } from 'fs/promises';
import { join } from 'path';
import { PROJECTS_DIR } from '../../shared/constants.js';
import type { ProjectInfo } from '../../shared/types.js';
import { readJsonl } from '../utils/jsonl-reader.js';

/**
 * Convert a project hash (directory name) back to a filesystem path.
 * Claude stores projects as: /some/path -> -some-path (/ replaced with -)
 */
export function hashToPath(hash: string): string {
  // Replace leading - with / and subsequent - with /
  // e.g. "-Users-myu-code" -> "/Users/myu/code"
  return hash.replace(/-/g, '/').replace(/^\//, '/');
}

/**
 * Get a human-readable project name from its path.
 */
export function pathToName(projectPath: string): string {
  const parts = projectPath.split('/').filter(Boolean);
  return parts[parts.length - 1] ?? projectPath;
}

/**
 * Discover all Claude Code projects by scanning ~/.claude/projects/.
 */
export async function discoverProjects(): Promise<ProjectInfo[]> {
  const projects: ProjectInfo[] = [];

  let entries: string[];
  try {
    entries = await readdir(PROJECTS_DIR);
  } catch {
    return projects;
  }

  for (const hash of entries) {
    const projectDir = join(PROJECTS_DIR, hash);
    let dirStat;
    try {
      dirStat = await stat(projectDir);
    } catch {
      continue;
    }
    if (!dirStat.isDirectory()) continue;

    const projectPath = hashToPath(hash);
    const sessionFiles = await discoverSessions(hash);
    const sessionCount = sessionFiles.length;

    // Find last activity from most recently modified session file
    let lastActivity: string | undefined;
    if (sessionFiles.length > 0) {
      // Sort by mtime descending
      const withStats = await Promise.all(
        sessionFiles.map(async (f) => {
          const s = await stat(join(PROJECTS_DIR, hash, f)).catch(() => null);
          return { file: f, mtime: s?.mtime ?? new Date(0) };
        })
      );
      withStats.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
      lastActivity = withStats[0]?.mtime.toISOString();
    }

    projects.push({
      hash,
      path: projectPath,
      name: pathToName(projectPath),
      sessionCount,
      lastActivity,
    });
  }

  // Sort by most recently active
  projects.sort((a, b) => {
    if (!a.lastActivity) return 1;
    if (!b.lastActivity) return -1;
    return b.lastActivity.localeCompare(a.lastActivity);
  });

  return projects;
}

/**
 * Discover all session JSONL files for a given project hash.
 * Excludes agent-*.jsonl files.
 */
export async function discoverSessions(projectHash: string): Promise<string[]> {
  const projectDir = join(PROJECTS_DIR, projectHash);
  let files: string[];
  try {
    files = await readdir(projectDir);
  } catch {
    return [];
  }
  return files.filter((f) => f.endsWith('.jsonl') && !f.startsWith('agent-'));
}

/**
 * Get the full path to a session JSONL file.
 */
export function getSessionPath(projectHash: string, sessionFile: string): string {
  return join(PROJECTS_DIR, projectHash, sessionFile);
}

/**
 * Find a session file across all projects by sessionId.
 * Returns { projectHash, filePath } or null if not found.
 */
export async function findSessionById(sessionId: string): Promise<{ projectHash: string; filePath: string } | null> {
  let projectHashes: string[];
  try {
    projectHashes = await readdir(PROJECTS_DIR);
  } catch {
    return null;
  }

  for (const hash of projectHashes) {
    const projectDir = join(PROJECTS_DIR, hash);
    const sessions = await discoverSessions(hash);
    for (const sessionFile of sessions) {
      // Session files are named <sessionId>.jsonl
      if (sessionFile === `${sessionId}.jsonl`) {
        return { projectHash: hash, filePath: join(projectDir, sessionFile) };
      }
      // Also check by reading first entry's sessionId (for edge cases)
    }
  }
  return null;
}

/**
 * Get the cwd/project path from a session file by reading the first user entry.
 */
export async function getSessionCwd(filePath: string): Promise<string | undefined> {
  for await (const entry of readJsonl(filePath)) {
    if (entry.cwd) return entry.cwd;
  }
  return undefined;
}
