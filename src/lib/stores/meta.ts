import { writable } from 'svelte/store';
import { api } from '$lib/api/client.js';
import type { SessionMeta, DashboardMeta } from '$shared/types.js';

export const allMeta = writable<DashboardMeta>({ sessions: {}, budgets: {} });

export async function loadAllMeta() {
  try {
    allMeta.set(await api.getAllMeta());
  } catch {
    // meta is optional, don't block UI
  }
}

export async function toggleBookmark(sessionId: string, currentValue: boolean) {
  const updated = await api.updateSessionMeta(sessionId, { bookmarked: !currentValue });
  allMeta.update((m) => ({ ...m, sessions: { ...m.sessions, [sessionId]: updated } }));
  return updated;
}

export async function updateTags(sessionId: string, tags: string[]) {
  const updated = await api.updateSessionMeta(sessionId, { tags });
  allMeta.update((m) => ({ ...m, sessions: { ...m.sessions, [sessionId]: updated } }));
  return updated;
}

export async function updateNotes(sessionId: string, notes: string) {
  const updated = await api.updateSessionMeta(sessionId, { notes });
  allMeta.update((m) => ({ ...m, sessions: { ...m.sessions, [sessionId]: updated } }));
  return updated;
}
