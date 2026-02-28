<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '$lib/api/client.js';
  import type { DashboardStats, SessionSummary } from '$shared/types.js';
  import LoadingSpinner from '$lib/components/shared/LoadingSpinner.svelte';
  import ActivityHeatmap from '$lib/components/dashboard/ActivityHeatmap.svelte';
  import TokenChart from '$lib/components/dashboard/TokenChart.svelte';
  import ModelBreakdown from '$lib/components/dashboard/ModelBreakdown.svelte';
  import TimeAgo from '$lib/components/shared/TimeAgo.svelte';

  let stats = $state<DashboardStats | null>(null);
  let recentSessions = $state<SessionSummary[]>([]);
  let loading = $state(true);

  onMount(async () => {
    try {
      [stats, { sessions: recentSessions }] = await Promise.all([
        api.getStats(),
        api.getSessions({ limit: 5, sort: 'date' }),
      ]);
    } catch (e) {
      console.error(e);
    } finally {
      loading = false;
    }
  });

  function formatTokens(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
    return String(n);
  }

  function formatCost(n: number): string {
    return n < 0.01 ? '<$0.01' : `$${n.toFixed(2)}`;
  }
</script>

<div class="space-y-6">
  <h1 class="text-xl font-bold text-white">Dashboard</h1>

  {#if loading}
    <LoadingSpinner />
  {:else if stats}
    <!-- Stats cards -->
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {#each [
        { label: 'Total Sessions', value: stats.totalSessions.toLocaleString(), icon: '📁', sub: `${stats.sessionsThisWeek} this week` },
        { label: 'Total Messages', value: stats.totalMessages.toLocaleString(), icon: '💬', sub: '' },
        { label: 'Total Tokens', value: formatTokens(stats.totalTokens), icon: '🔤', sub: `${formatTokens(stats.tokensToday)} today` },
        { label: 'Est. Cost', value: formatCost(stats.totalCost), icon: '💰', sub: '' },
      ] as card}
        <div class="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div class="flex items-start justify-between">
            <div>
              <div class="text-2xl font-bold text-white">{card.value}</div>
              <div class="text-xs text-gray-500 mt-1">{card.label}</div>
              {#if card.sub}
                <div class="text-xs text-gray-600 mt-0.5">{card.sub}</div>
              {/if}
            </div>
            <span class="text-2xl">{card.icon}</span>
          </div>
        </div>
      {/each}
    </div>

    <!-- Activity heatmap -->
    <div class="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <h2 class="text-sm font-semibold text-gray-300 mb-4">Activity (52 weeks)</h2>
      <ActivityHeatmap activity={stats.dailyActivity} />
    </div>

    <!-- Charts -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div class="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <h2 class="text-sm font-semibold text-gray-300 mb-3">Daily Token Usage (30d)</h2>
        <TokenChart activity={stats.dailyActivity} />
      </div>

      <div class="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <h2 class="text-sm font-semibold text-gray-300 mb-3">Model Breakdown</h2>
        <ModelBreakdown usage={stats.modelUsage} />
      </div>
    </div>

    <!-- Recent sessions -->
    {#if recentSessions.length > 0}
      <div class="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <div class="flex items-center justify-between mb-3">
          <h2 class="text-sm font-semibold text-gray-300">Recent Sessions</h2>
          <a href="/sessions" class="text-xs text-blue-400 hover:underline">View all</a>
        </div>
        <div class="space-y-2">
          {#each recentSessions as session}
            <a
              href="/sessions/{session.id}"
              class="flex items-center gap-3 py-2 border-b border-gray-800 last:border-0 hover:bg-gray-800/50 -mx-2 px-2 rounded transition-colors"
            >
              <div class="flex-1 min-w-0">
                <p class="text-xs text-gray-300 truncate">{session.firstUserPrompt}</p>
                <span class="text-xs text-gray-600">{session.projectName}</span>
              </div>
              <div class="shrink-0 text-xs text-gray-500">
                <TimeAgo timestamp={session.lastTimestamp} />
              </div>
            </a>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Model usage table -->
    {#if stats.modelUsage.length > 0}
      <div class="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <h2 class="text-sm font-semibold text-gray-300 mb-3">Model Usage</h2>
        <table class="w-full text-xs">
          <thead>
            <tr class="text-gray-600 border-b border-gray-800">
              <th class="text-left pb-2">Model</th>
              <th class="text-right pb-2">Input</th>
              <th class="text-right pb-2">Output</th>
              <th class="text-right pb-2">Cost</th>
            </tr>
          </thead>
          <tbody>
            {#each stats.modelUsage as m}
              <tr class="border-b border-gray-800/50 text-gray-400">
                <td class="py-2 font-mono">{m.model}</td>
                <td class="py-2 text-right">{formatTokens(m.inputTokens)}</td>
                <td class="py-2 text-right">{formatTokens(m.outputTokens)}</td>
                <td class="py-2 text-right text-green-600">{formatCost(m.estimatedCost)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  {:else}
    <div class="text-gray-500">Failed to load stats</div>
  {/if}
</div>
