<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '$lib/api/client.js';
  import type { SessionSummary } from '$shared/types.js';
  import LoadingSpinner from '$lib/components/shared/LoadingSpinner.svelte';
  import EmptyState from '$lib/components/shared/EmptyState.svelte';
  import TimeAgo from '$lib/components/shared/TimeAgo.svelte';
  import Badge from '$lib/components/shared/Badge.svelte';

  let sessions = $state<SessionSummary[]>([]);
  let loading = $state(true);

  onMount(async () => {
    try {
      const result = await api.getSessions({ limit: 100, sort: 'date' });
      // Only sessions with edits
      sessions = result.sessions.filter((s) => s.editCount > 0);
    } catch (e) {
      console.error(e);
    } finally {
      loading = false;
    }
  });
</script>

<div class="space-y-4">
  <h1 class="text-xl font-bold text-white">Diffs</h1>

  {#if loading}
    <LoadingSpinner />
  {:else if sessions.length === 0}
    <EmptyState message="No sessions with file edits found" />
  {:else}
    <div class="space-y-2">
      {#each sessions as session}
        <a
          href="/diffs/{session.id}"
          class="flex items-center gap-4 bg-gray-900 border border-gray-800 rounded-lg p-4 hover:border-gray-600 hover:bg-gray-800/50 transition-colors"
        >
          <div class="flex-1 min-w-0">
            <p class="text-sm text-gray-200 truncate">{session.firstUserPrompt}</p>
            <div class="flex items-center gap-2 mt-1">
              <Badge label={session.projectName} color="blue" />
              <span class="text-xs text-yellow-600">{session.editCount} edits</span>
            </div>
          </div>
          <div class="shrink-0 text-xs text-gray-500">
            <TimeAgo timestamp={session.lastTimestamp} />
          </div>
        </a>
      {/each}
    </div>
  {/if}
</div>
