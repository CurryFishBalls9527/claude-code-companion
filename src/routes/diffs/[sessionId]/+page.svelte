<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { api } from '$lib/api/client.js';
  import type { FileDiff } from '$shared/types.js';
  import DiffViewer from '$lib/components/diff/DiffViewer.svelte';
  import LoadingSpinner from '$lib/components/shared/LoadingSpinner.svelte';
  import EmptyState from '$lib/components/shared/EmptyState.svelte';

  const sessionId = $derived($page.params.sessionId);

  let diffs = $state<FileDiff[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let selectedFile = $state<string | null>(null);

  onMount(async () => {
    try {
      diffs = await api.getSessionDiffs(sessionId);
      if (diffs.length > 0) selectedFile = diffs[0].filePath;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load diffs';
    } finally {
      loading = false;
    }
  });

  // Group diffs by file path
  const fileGroups = $derived(
    diffs.reduce<Map<string, FileDiff[]>>((map, diff) => {
      if (!map.has(diff.filePath)) map.set(diff.filePath, []);
      map.get(diff.filePath)!.push(diff);
      return map;
    }, new Map())
  );

  const selectedDiffs = $derived(
    selectedFile ? (fileGroups.get(selectedFile) ?? []) : []
  );

  const totalAdded = $derived(diffs.reduce((s, d) => s + d.linesAdded, 0));
  const totalRemoved = $derived(diffs.reduce((s, d) => s + d.linesRemoved, 0));
</script>

<div class="flex h-full gap-4">
  {#if loading}
    <div class="flex-1 flex items-center justify-center">
      <LoadingSpinner />
    </div>
  {:else if error}
    <div class="text-red-400">{error}</div>
  {:else if diffs.length === 0}
    <div class="flex-1">
      <EmptyState message="No file changes in this session" />
    </div>
  {:else}
    <!-- File sidebar -->
    <div class="w-64 shrink-0 bg-gray-900 border border-gray-800 rounded-lg overflow-auto">
      <div class="p-3 border-b border-gray-800">
        <div class="text-xs text-gray-400 font-semibold">Changed Files</div>
        <div class="text-xs text-gray-600 mt-1">
          <span class="text-green-500">+{totalAdded}</span>
          <span class="text-red-400 ml-1">-{totalRemoved}</span>
        </div>
      </div>
      <div class="py-1">
        {#each fileGroups as [filePath, fileDiffs]}
          <button
            onclick={() => (selectedFile = filePath)}
            class="w-full text-left px-3 py-2 text-xs font-mono truncate hover:bg-gray-800 transition-colors {selectedFile === filePath ? 'bg-blue-600/20 text-blue-300' : 'text-gray-400'}"
          >
            <div class="truncate">{filePath.split('/').pop()}</div>
            <div class="text-gray-600 truncate text-[10px]">{filePath}</div>
            <div class="text-[10px] mt-0.5">
              <span class="text-yellow-600">{fileDiffs.length} change{fileDiffs.length > 1 ? 's' : ''}</span>
            </div>
          </button>
        {/each}
      </div>
    </div>

    <!-- Diff content -->
    <div class="flex-1 overflow-auto space-y-4 min-w-0">
      <div class="flex items-center gap-3">
        <h2 class="text-sm font-semibold text-gray-200 font-mono truncate">
          {selectedFile ?? ''}
        </h2>
        <a
          href="/sessions/{sessionId}"
          class="text-xs text-blue-400 hover:underline shrink-0"
        >
          View Session
        </a>
      </div>

      {#each selectedDiffs as diff (diff.toolCallId)}
        <div class="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <DiffViewer {diff} />
        </div>
      {/each}
    </div>
  {/if}
</div>
