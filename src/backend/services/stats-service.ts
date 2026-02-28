import { readFile } from 'fs/promises';
import { STATS_CACHE_FILE } from '../../shared/constants.js';
import { discoverProjects, discoverSessions, getSessionPath } from './claude-data.js';
import { parseSessionSummary, parseSessionDetail } from './session-parser.js';
import { calculateCost } from '../utils/cost-calculator.js';
import type { DashboardStats, DailyActivity, ModelUsage, TopFile, ToolUsageStat, SessionSummary, ToolTiming } from '../../shared/types.js';

interface StatsCacheFile {
  dailyActivity?: Array<{ date: string; messageCount?: number; tokensUsed?: number }>;
  modelUsage?: Record<string, { inputTokens?: number; outputTokens?: number }>;
  hourCounts?: number[];
  tokenUsage?: { inputTokens?: number; outputTokens?: number };
}

/**
 * Read stats-cache.json if it exists, otherwise return null.
 */
async function readStatsCache(): Promise<StatsCacheFile | null> {
  try {
    const raw = await readFile(STATS_CACHE_FILE, 'utf-8');
    return JSON.parse(raw) as StatsCacheFile;
  } catch {
    return null;
  }
}

/**
 * Compute dashboard stats from session files (used when stats-cache.json is missing).
 */
async function computeStatsFromSessions(): Promise<SessionSummary[]> {
  const projects = await discoverProjects();
  const summaries: SessionSummary[] = [];

  for (const project of projects) {
    const sessions = await discoverSessions(project.hash);
    for (const sessionFile of sessions) {
      try {
        const summary = await parseSessionSummary(getSessionPath(project.hash, sessionFile));
        summaries.push(summary);
      } catch {
        // Skip unreadable sessions
      }
    }
  }

  return summaries;
}

/**
 * Get the full dashboard stats, combining stats-cache.json with computed data.
 */
export async function getDashboardStats(): Promise<DashboardStats> {
  const cache = await readStatsCache();
  const summaries = await computeStatsFromSessions();

  // Compute aggregates from session summaries
  const totalSessions = summaries.length;
  const totalMessages = summaries.reduce((s, m) => s + m.messageCount, 0);
  const totalInputTokens = summaries.reduce((s, m) => s + m.tokenUsage.input_tokens, 0);
  const totalOutputTokens = summaries.reduce((s, m) => s + m.tokenUsage.output_tokens, 0);
  const totalTokens = totalInputTokens + totalOutputTokens;
  const totalCost = summaries.reduce((s, m) => s + m.estimatedCost, 0);

  // Today's tokens
  const todayStr = new Date().toISOString().slice(0, 10);
  const todaySummaries = summaries.filter(
    (s) => s.firstTimestamp?.slice(0, 10) === todayStr || s.lastTimestamp?.slice(0, 10) === todayStr
  );
  const tokensToday = todaySummaries.reduce(
    (s, m) => s + m.tokenUsage.input_tokens + m.tokenUsage.output_tokens,
    0
  );

  // Sessions this week
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const sessionsThisWeek = summaries.filter(
    (s) => s.lastTimestamp && new Date(s.lastTimestamp) >= oneWeekAgo
  ).length;

  // Build daily activity (52 weeks)
  const dailyActivity = buildDailyActivity(summaries, cache);

  // Model usage
  const modelUsage = buildModelUsage(summaries);

  // Hour counts (from cache or from session timestamps)
  const hourCounts = cache?.hourCounts ?? buildHourCounts(summaries);

  return {
    totalSessions,
    totalMessages,
    totalTokens,
    totalCost,
    tokensToday,
    sessionsThisWeek,
    dailyActivity,
    modelUsage,
    hourCounts,
  };
}

function buildDailyActivity(summaries: SessionSummary[], cache: StatsCacheFile | null): DailyActivity[] {
  // Build 52-week grid (364 days + today)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const startDate = new Date(today.getTime() - 364 * 24 * 60 * 60 * 1000);

  const activityMap = new Map<string, DailyActivity>();

  // Initialize all dates
  for (let d = new Date(startDate); d <= today; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().slice(0, 10);
    activityMap.set(dateStr, { date: dateStr, messageCount: 0, tokenCount: 0, sessionCount: 0 });
  }

  // Aggregate from session summaries
  for (const s of summaries) {
    const date = (s.lastTimestamp || s.firstTimestamp)?.slice(0, 10);
    if (!date || !activityMap.has(date)) continue;
    const entry = activityMap.get(date)!;
    entry.messageCount += s.messageCount;
    entry.tokenCount += s.tokenUsage.input_tokens + s.tokenUsage.output_tokens;
    entry.sessionCount += 1;
  }

  return Array.from(activityMap.values()).sort((a, b) => a.date.localeCompare(b.date));
}

function buildModelUsage(summaries: SessionSummary[]): ModelUsage[] {
  const map = new Map<string, ModelUsage>();

  for (const s of summaries) {
    const model = s.model || 'unknown';
    if (!map.has(model)) {
      map.set(model, { model, inputTokens: 0, outputTokens: 0, estimatedCost: 0 });
    }
    const entry = map.get(model)!;
    entry.inputTokens += s.tokenUsage.input_tokens;
    entry.outputTokens += s.tokenUsage.output_tokens;
    entry.estimatedCost += s.estimatedCost;
  }

  return Array.from(map.values()).sort((a, b) => b.estimatedCost - a.estimatedCost);
}

function buildHourCounts(summaries: SessionSummary[]): number[] {
  const counts = new Array(24).fill(0);
  for (const s of summaries) {
    if (s.lastTimestamp) {
      const hour = new Date(s.lastTimestamp).getHours();
      counts[hour]++;
    }
  }
  return counts;
}

/**
 * Get the most frequently modified files across all sessions.
 * Reads full session details to extract Edit/Write tool call file paths.
 */
export async function getTopFiles(limit = 20): Promise<TopFile[]> {
  const projects = await discoverProjects();
  const fileMap = new Map<string, { editCount: number; sessions: Set<string>; lastModified: string }>();

  for (const project of projects) {
    const sessions = await discoverSessions(project.hash);
    for (const sessionFile of sessions) {
      try {
        const filePath = getSessionPath(project.hash, sessionFile);
        const detail = await parseSessionDetail(filePath);

        for (const msg of detail.messages) {
          for (const tc of msg.toolCalls ?? []) {
            if (tc.name !== 'Edit' && tc.name !== 'Write') continue;
            const fp = String(tc.input.file_path ?? '');
            if (!fp) continue;

            if (!fileMap.has(fp)) {
              fileMap.set(fp, { editCount: 0, sessions: new Set(), lastModified: msg.timestamp });
            }
            const entry = fileMap.get(fp)!;
            entry.editCount++;
            entry.sessions.add(detail.id);
            if (msg.timestamp > entry.lastModified) {
              entry.lastModified = msg.timestamp;
            }
          }
        }
      } catch {
        // Skip unreadable sessions
      }
    }
  }

  return Array.from(fileMap.entries())
    .map(([fp, data]) => ({
      filePath: fp,
      editCount: data.editCount,
      sessionCount: data.sessions.size,
      lastModified: data.lastModified,
    }))
    .sort((a, b) => b.editCount - a.editCount)
    .slice(0, limit);
}

/**
 * Get tool usage statistics broken down by actual tool name.
 */
export async function getToolUsage(): Promise<ToolUsageStat[]> {
  const projects = await discoverProjects();
  const toolCounts = new Map<string, number>();

  for (const project of projects) {
    const sessions = await discoverSessions(project.hash);
    for (const sessionFile of sessions) {
      try {
        const filePath = getSessionPath(project.hash, sessionFile);
        const detail = await parseSessionDetail(filePath);
        for (const msg of detail.messages) {
          for (const tc of msg.toolCalls ?? []) {
            toolCounts.set(tc.name, (toolCounts.get(tc.name) ?? 0) + 1);
          }
        }
      } catch {
        // Skip unreadable sessions
      }
    }
  }

  const total = Array.from(toolCounts.values()).reduce((s, n) => s + n, 0);
  return Array.from(toolCounts.entries())
    .map(([toolName, count]) => ({
      toolName,
      count,
      percentage: total > 0 ? (count / total) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Compute average and max tool call durations from consecutive timestamps.
 * Duration = time between assistant message with tool_use and next user message with tool_result.
 */
export async function getToolTiming(sessionId?: string): Promise<ToolTiming[]> {
  const { findSessionById } = await import('./claude-data.js');
  const projects = sessionId ? [] : await discoverProjects();
  const timings = new Map<string, { total: number; max: number; count: number }>();

  async function processDetail(filePath: string) {
    const detail = await parseSessionDetail(filePath);
    const msgs = detail.messages;

    for (let i = 0; i < msgs.length; i++) {
      const msg = msgs[i];
      if (msg.role !== 'assistant' || !msg.toolCalls?.length) continue;

      const nextMsg = msgs[i + 1];
      if (!nextMsg) continue;

      const startMs = new Date(msg.timestamp).getTime();
      const endMs = new Date(nextMsg.timestamp).getTime();
      const durationMs = endMs - startMs;
      if (durationMs < 0 || durationMs > 300_000) continue; // sanity: ignore >5min gaps

      for (const tc of msg.toolCalls) {
        const entry = timings.get(tc.name) ?? { total: 0, max: 0, count: 0 };
        entry.total += durationMs;
        entry.max = Math.max(entry.max, durationMs);
        entry.count++;
        timings.set(tc.name, entry);
      }
    }
  }

  if (sessionId) {
    const found = await findSessionById(sessionId);
    if (found) await processDetail(found.filePath).catch(() => {});
  } else {
    for (const project of projects) {
      const sessions = await discoverSessions(project.hash);
      for (const sf of sessions) {
        await processDetail(getSessionPath(project.hash, sf)).catch(() => {});
      }
    }
  }

  return Array.from(timings.entries())
    .map(([toolName, data]) => ({
      toolName,
      avgMs: Math.round(data.total / data.count),
      maxMs: data.max,
      count: data.count,
      totalMs: data.total,
    }))
    .sort((a, b) => b.avgMs - a.avgMs);
}
