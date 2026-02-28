<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '$lib/api/client.js';
  import type { TopFile } from '$shared/types.js';
  import LoadingSpinner from '$lib/components/shared/LoadingSpinner.svelte';
  import EmptyState from '$lib/components/shared/EmptyState.svelte';
  import TimeAgo from '$lib/components/shared/TimeAgo.svelte';

  let files = $state<TopFile[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);

  onMount(async () => {
    try {
      files = await api.getTopFiles(50);
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load files';
    } finally {
      loading = false;
    }
  });
</script>

<div class="space-y-4">
  <h1 class="text-xl font-bold text-white">Most Edited Files</h1>

  {#if loading}
    <LoadingSpinner />
  {:else if error}
    <div class="text-red-400 text-sm">{error}</div>
  {:else if files.length === 0}
    <EmptyState message="No file edits found across sessions" />
  {:else}
    <div class="space-y-1">
      {#each files as file, i}
        <a
          href="/files/timeline?path={encodeURIComponent(file.filePath)}"
          class="flex items-center gap-4 bg-gray-900 border border-gray-800 rounded-lg px-4 py-3 hover:border-gray-600 hover:bg-gray-800/50 transition-colors"
        >
          <span class="text-sm text-gray-600 w-6 text-right">{i + 1}</span>
          <div class="flex-1 min-w-0">
            <p class="text-sm font-mono text-gray-200 truncate">{file.filePath.split('/').pop()}</p>
            <p class="text-xs text-gray-600 font-mono truncate">{file.filePath}</p>
          </div>
          <div class="shrink-0 text-right space-y-0.5">
            <div class="text-xs text-yellow-600">{file.editCount} edit{file.editCount !== 1 ? 's' : ''}</div>
            <div class="text-xs text-gray-600">{file.sessionCount} session{file.sessionCount !== 1 ? 's' : ''}</div>
          </div>
          {#if file.lastModified}
            <div class="shrink-0 text-xs text-gray-600">
              <TimeAgo timestamp={file.lastModified} />
            </div>
          {/if}
        </a>
      {/each}
    </div>
  {/if}
</div>
