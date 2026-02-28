import { writable } from 'svelte/store';
import type { RawSessionEntry } from '$shared/types.js';

export const liveSessionId = writable<string | null>(null);
export const liveEntries = writable<RawSessionEntry[]>([]);
export const liveConnected = writable(false);
