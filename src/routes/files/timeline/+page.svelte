<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { api } from '$lib/api/client.js';
  import type { FileEdit, FileDiff } from '$shared/types.js';
  import DiffViewer from '$lib/components/diff/DiffViewer.svelte';
  import LoadingSpinner from '$lib/components/shared/LoadingSpinner.svelte';
  import EmptyState from '$lib/components/shared/EmptyState.svelte';
  import TimeAgo from '$lib/components/shared/TimeAgo.svelte';

  const filePath = $derived($page.url.searchParams.get('path') ?? '');

  let edits = $state<FileEdit[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let expandedIndex = $state<number | null>(null);

  onMount(async () => {
    if (!filePath) {
      error = 'No file path specified';
      loading = false;
      return;
    }
    try {
      edits = await api.getFileTimeline(filePath);
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load file timeline';
    } finally {
      loading = false;
    }
  });

  function toFileDiff(edit: FileEdit): FileDiff {
    return {
      sessionId: edit.sessionId,
      toolCallId: '',
      toolName: edit.toolName,
      filePath,
      unifiedDiff: edit.unifiedDiff,
      linesAdded: edit.linesAdded,
      linesRemoved: edit.linesRemoved,
      timestamp: edit.timestamp,
    };
  }

  function toggleExpand(i: number) {
    expandedIndex = expandedIndex === i ? null : i;
  }

  const totalAdded = $derived(edits.reduce((s, e) => s + e.linesAdded, 0));
  const totalRemoved = $derived(edits.reduce((s, e) => s + e.linesRemoved, 0));
</script>

<div class="space-y-4">
  <div class="flex items-center gap-3">
    <a href="/files" class="text-gray-500 hover:text-gray-300 transition-colors">
      <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
      </svg>
    </a>
    <div class="min-w-0">
      <h1 class="text-xl font-bold text-white font-mono truncate">{filePath.split('/').pop()}</h1>
      <p class="text-xs text-gray-500 font-mono truncate">{filePath}</p>
    </div>
  </div>

  {#if loading}
    <LoadingSpinner />
  {:else if error}
    <div class="text-red-400 text-sm">{error}</div>
  {:else if edits.length === 0}
    <EmptyState message="No edits found for this file" />
  {:else}
    <!-- Summary bar -->
    <div class="flex items-center gap-4 bg-gray-900 border border-gray-800 rounded-lg px-4 py-3 text-sm">
      <span class="text-gray-400">{edits.length} edit{edits.length !== 1 ? 's' : ''}</span>
      <span class="text-gray-600">·</span>
      <span class="text-green-500">+{totalAdded} lines added</span>
      <span class="text-gray-600">·</span>
      <span class="text-red-400">-{totalRemoved} lines removed</span>
    </div>

    <!-- Timeline -->
    <div class="relative">
      <!-- Vertical line -->
      <div class="absolute left-[19px] top-4 bottom-4 w-px bg-gray-800"></div>

      <div class="space-y-3">
        {#each edits as edit, i}
          <div class="relative flex gap-4">
            <!-- Timeline dot -->
            <div class="shrink-0 w-10 flex items-start pt-3">
              <div class="w-2.5 h-2.5 rounded-full border-2 {edit.toolName === 'Write' ? 'bg-blue-500 border-blue-400' : 'bg-yellow-500 border-yellow-400'} z-10"></div>
            </div>

            <!-- Card -->
            <div class="flex-1 min-w-0 bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
              <button
                onclick={() => toggleExpand(i)}
                class="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-800/50 transition-colors text-left"
              >
                <span class="text-xs px-1.5 py-0.5 rounded font-mono {edit.toolName === 'Write' ? 'bg-blue-900/50 text-blue-400' : 'bg-yellow-900/50 text-yellow-400'}">
                  {edit.toolName}
                </span>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2">
                    <span class="text-sm text-gray-300 truncate">{edit.projectName}</span>
                    <span class="text-xs text-gray-600">in</span>
                    <a
                      href="/sessions/{edit.sessionId}"
                      onclick={(e) => e.stopPropagation()}
                      class="text-xs text-blue-400 hover:text-blue-300 font-mono truncate max-w-[120px]"
                    >
                      {edit.sessionId.slice(0, 8)}…
                    </a>
                  </div>
                </div>
                <div class="shrink-0 flex items-center gap-3">
                  <span class="text-xs text-green-500">+{edit.linesAdded}</span>
                  <span class="text-xs text-red-400">-{edit.linesRemoved}</span>
                  <span class="text-xs text-gray-600"><TimeAgo timestamp={edit.timestamp} /></span>
                  <svg
                    class="h-3.5 w-3.5 text-gray-600 transition-transform {expandedIndex === i ? 'rotate-180' : ''}"
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"
                  >
                    <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </button>

              {#if expandedIndex === i}
                <div class="px-4 pb-4 border-t border-gray-800">
                  <div class="pt-3">
                    <DiffViewer diff={toFileDiff(edit)} />
                  </div>
                </div>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>
