import { readFile, writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { CLAUDE_HOME } from '../../shared/constants.js';
import type { SessionMeta, DashboardMeta } from '../../shared/types.js';

const META_FILE = join(CLAUDE_HOME, 'dashboard-meta.json');

async function readMeta(): Promise<DashboardMeta> {
  try {
    const raw = await readFile(META_FILE, 'utf-8');
    return JSON.parse(raw) as DashboardMeta;
  } catch {
    return { sessions: {}, budgets: {} };
  }
}

async function writeMeta(meta: DashboardMeta): Promise<void> {
  await mkdir(dirname(META_FILE), { recursive: true });
  await writeFile(META_FILE, JSON.stringify(meta, null, 2), 'utf-8');
}

export async function getAllMeta(): Promise<DashboardMeta> {
  return readMeta();
}

export async function getSessionMeta(sessionId: string): Promise<SessionMeta | null> {
  const meta = await readMeta();
  return meta.sessions[sessionId] ?? null;
}

export async function updateSessionMeta(sessionId: string, patch: Partial<SessionMeta>): Promise<SessionMeta> {
  const meta = await readMeta();
  const existing = meta.sessions[sessionId] ?? {
    sessionId,
    bookmarked: false,
    tags: [],
    notes: '',
    updatedAt: new Date().toISOString(),
  };
  const updated: SessionMeta = {
    ...existing,
    ...patch,
    sessionId, // always preserve
    updatedAt: new Date().toISOString(),
  };
  meta.sessions[sessionId] = updated;
  await writeMeta(meta);
  return updated;
}

export async function getBudgets(): Promise<DashboardMeta['budgets']> {
  const meta = await readMeta();
  return meta.budgets ?? {};
}

export async function updateBudgets(budgets: DashboardMeta['budgets']): Promise<void> {
  const meta = await readMeta();
  meta.budgets = budgets;
  await writeMeta(meta);
}
