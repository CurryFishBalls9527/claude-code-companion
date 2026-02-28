<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '$lib/api/client.js';
  import type { SessionSummary, ProjectInfo } from '$shared/types.js';
  import LoadingSpinner from '$lib/components/shared/LoadingSpinner.svelte';
  import EmptyState from '$lib/components/shared/EmptyState.svelte';
  import TimeAgo from '$lib/components/shared/TimeAgo.svelte';
  import Badge from '$lib/components/shared/Badge.svelte';

  let sessions = $state<SessionSummary[]>([]);
  let projects = $state<ProjectInfo[]>([]);
  let total = $state(0);
  let loading = $state(true);
  let error = $state<string | null>(null);

  let selectedProject = $state('');
  let sort = $state<'date' | 'tokens' | 'messages'>('date');
  let offset = $state(0);
  const LIMIT = 30;

  async function loadSessions() {
    loading = true;
    error = null;
    try {
      const result = await api.getSessions({
        project: selectedProject || undefined,
        limit: LIMIT,
        offset,
        sort,
      });
      sessions = result.sessions;
      total = result.total;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load sessions';
    } finally {
      loading = false;
    }
  }

  onMount(async () => {
    projects = await api.getProjects().catch(() => []);
    await loadSessions();
  });

  function formatDuration(ms: number): string {
    if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
    if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
    return `${(ms / 3_600_000).toFixed(1)}h`;
  }

  function formatTokens(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
    return String(n);
  }
</script>

<div class="space-y-4">
  <div class="flex items-center justify-between">
    <h1 class="text-xl font-bold text-white">Sessions</h1>
    <span class="text-sm text-gray-500">{total} total</span>
  </div>

  <!-- Filters -->
  <div class="flex gap-3">
    <select
      bind:value={selectedProject}
      onchange={() => { offset = 0; loadSessions(); }}
      class="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500"
    >
      <option value="">All projects</option>
      {#each projects as p}
        <option value={p.hash}>{p.name} ({p.sessionCount})</option>
      {/each}
    </select>

    <select
      bind:value={sort}
      onchange={() => { offset = 0; loadSessions(); }}
      class="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500"
    >
      <option value="date">Sort by date</option>
      <option value="tokens">Sort by tokens</option>
      <option value="messages">Sort by messages</option>
    </select>
  </div>

  {#if loading}
    <LoadingSpinner />
  {:else if error}
    <div class="text-red-400 text-sm">{error}</div>
  {:else if sessions.length === 0}
    <EmptyState message="No sessions found" />
  {:else}
    <div class="space-y-2">
      {#each sessions as session}
        <a
          href="/sessions/{session.id}"
          class="block bg-gray-900 border border-gray-800 rounded-lg p-4 hover:border-gray-600 hover:bg-gray-800/50 transition-colors"
        >
          <div class="flex items-start justify-between gap-4">
            <div class="flex-1 min-w-0">
              <p class="text-sm text-gray-200 truncate leading-snug">{session.firstUserPrompt}</p>
              <div class="flex items-center gap-2 mt-2 flex-wrap">
                <Badge label={session.projectName} color="blue" />
                {#if session.gitBranch && session.gitBranch !== 'HEAD'}
                  <Badge label={session.gitBranch} color="purple" />
                {/if}
                <span class="text-xs text-gray-500">{session.messageCount} msgs</span>
                <span class="text-xs text-gray-500">{session.toolCallCount} tools</span>
                {#if session.editCount > 0}
                  <span class="text-xs text-yellow-600">{session.editCount} edits</span>
                {/if}
                <span class="text-xs text-gray-500">{formatTokens(session.tokenUsage.input_tokens + session.tokenUsage.output_tokens)} tokens</span>
              </div>
            </div>
            <div class="shrink-0 text-right">
              <div class="text-xs text-gray-500"><TimeAgo timestamp={session.lastTimestamp} /></div>
              <div class="text-xs text-gray-600 mt-1">{formatDuration(session.durationMs)}</div>
              {#if session.estimatedCost > 0}
                <div class="text-xs text-green-700 mt-1">${session.estimatedCost.toFixed(3)}</div>
              {/if}
            </div>
          </div>
        </a>
      {/each}
    </div>

    <!-- Pagination -->
    {#if total > LIMIT}
      <div class="flex items-center justify-center gap-4 pt-4">
        <button
          onclick={() => { offset = Math.max(0, offset - LIMIT); loadSessions(); }}
          disabled={offset === 0}
          class="px-4 py-2 bg-gray-800 border border-gray-700 rounded text-sm text-gray-300 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Previous
        </button>
        <span class="text-sm text-gray-500">
          {offset + 1}–{Math.min(offset + LIMIT, total)} of {total}
        </span>
        <button
          onclick={() => { offset = offset + LIMIT; loadSessions(); }}
          disabled={offset + LIMIT >= total}
          class="px-4 py-2 bg-gray-800 border border-gray-700 rounded text-sm text-gray-300 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Next
        </button>
      </div>
    {/if}
  {/if}
</div>
