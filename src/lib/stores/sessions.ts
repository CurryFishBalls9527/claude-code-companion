import { writable, derived } from 'svelte/store';
import { api } from '$lib/api/client.js';
import type { SessionSummary, SessionDetail, ProjectInfo } from '$shared/types.js';

export const projects = writable<ProjectInfo[]>([]);
export const sessions = writable<SessionSummary[]>([]);
export const sessionTotal = writable(0);
export const activeSession = writable<SessionDetail | null>(null);
export const sessionsLoading = writable(false);
export const sessionsError = writable<string | null>(null);

export async function loadProjects() {
  try {
    projects.set(await api.getProjects());
  } catch (err) {
    console.error('Failed to load projects:', err);
  }
}

export async function loadSessions(params?: {
  project?: string;
  limit?: number;
  offset?: number;
  sort?: 'date' | 'tokens' | 'messages';
}) {
  sessionsLoading.set(true);
  sessionsError.set(null);
  try {
    const result = await api.getSessions(params);
    sessions.set(result.sessions);
    sessionTotal.set(result.total);
  } catch (err) {
    sessionsError.set(err instanceof Error ? err.message : 'Failed to load sessions');
  } finally {
    sessionsLoading.set(false);
  }
}

export async function loadSessionDetail(id: string) {
  try {
    const detail = await api.getSession(id);
    activeSession.set(detail);
    return detail;
  } catch (err) {
    console.error('Failed to load session:', err);
    return null;
  }
}
