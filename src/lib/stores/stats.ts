import { writable } from 'svelte/store';
import { api } from '$lib/api/client.js';
import type { DashboardStats } from '$shared/types.js';

export const stats = writable<DashboardStats | null>(null);
export const statsLoading = writable(false);
export const statsError = writable<string | null>(null);

export async function loadStats() {
  statsLoading.set(true);
  statsError.set(null);
  try {
    const data = await api.getStats();
    stats.set(data);
  } catch (err) {
    statsError.set(err instanceof Error ? err.message : 'Failed to load stats');
  } finally {
    statsLoading.set(false);
  }
}
