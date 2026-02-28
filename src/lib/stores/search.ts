import { writable } from 'svelte/store';
import { api } from '$lib/api/client.js';
import type { SearchResult } from '$shared/types.js';

export const searchQuery = writable('');
export const searchResults = writable<SearchResult[]>([]);
export const searchLoading = writable(false);

export async function runSearch(q: string, projectHash?: string) {
  if (!q.trim()) {
    searchResults.set([]);
    return;
  }
  searchLoading.set(true);
  try {
    const results = await api.search(q, { project: projectHash, limit: 50 });
    searchResults.set(results);
  } catch (err) {
    console.error('Search failed:', err);
    searchResults.set([]);
  } finally {
    searchLoading.set(false);
  }
}
