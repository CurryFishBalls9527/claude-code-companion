<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { api } from '$lib/api/client.js';
  import type { SearchResult } from '$shared/types.js';
  import LoadingSpinner from '$lib/components/shared/LoadingSpinner.svelte';
  import EmptyState from '$lib/components/shared/EmptyState.svelte';
  import Badge from '$lib/components/shared/Badge.svelte';

  let query = $state($page.url.searchParams.get('q') ?? '');
  let results = $state<SearchResult[]>([]);
  let loading = $state(false);
  let searched = $state(false);

  async function search() {
    if (!query.trim()) return;
    loading = true;
    searched = true;
    try {
      results = await api.search(query, { limit: 50 });
    } catch (e) {
      console.error(e);
      results = [];
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    if (query) search();
  });

  function handleKey(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      goto(`/search?q=${encodeURIComponent(query)}`, { replaceState: true });
      search();
    }
  }

  const matchTypeColor: Record<string, 'blue' | 'green' | 'yellow' | 'gray'> = {
    'user-prompt': 'blue',
    'assistant-response': 'green',
    'tool-call': 'yellow',
    'tool-result': 'gray',
  };
</script>

<div class="space-y-4">
  <h1 class="text-xl font-bold text-white">Search</h1>

  <div class="flex gap-3">
    <input
      type="search"
      bind:value={query}
      onkeydown={handleKey}
      placeholder="Search across all sessions..."
      class="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500"
    />
    <button
      onclick={search}
      class="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm text-white transition-colors"
    >
      Search
    </button>
  </div>

  {#if loading}
    <LoadingSpinner />
  {:else if searched && results.length === 0}
    <EmptyState message="No results found for '{query}'" />
  {:else if results.length > 0}
    <div class="text-xs text-gray-500 mb-2">{results.length} result{results.length > 1 ? 's' : ''}</div>
    <div class="space-y-2">
      {#each results as result}
        <a
          href="/sessions/{result.sessionId}"
          class="block bg-gray-900 border border-gray-800 rounded-lg p-4 hover:border-gray-600 hover:bg-gray-800/50 transition-colors"
        >
          <div class="flex items-start gap-3">
            <Badge label={result.matchType.replace('-', ' ')} color={matchTypeColor[result.matchType] ?? 'gray'} />
            <div class="flex-1 min-w-0">
              <p class="text-xs text-gray-400 font-mono">{result.projectName} · {new Date(result.timestamp).toLocaleString()}</p>
              <p class="mt-1 text-sm text-gray-300 leading-relaxed">{result.snippet}</p>
            </div>
          </div>
        </a>
      {/each}
    </div>
  {:else if !searched}
    <div class="text-gray-600 text-sm">Enter a search term and press Enter</div>
  {/if}
</div>
