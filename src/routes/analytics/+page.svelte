<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '$lib/api/client.js';
  import type { DashboardStats } from '$shared/types.js';
  import LoadingSpinner from '$lib/components/shared/LoadingSpinner.svelte';

  let stats = $state<DashboardStats | null>(null);
  let loading = $state(true);

  onMount(async () => {
    try {
      stats = await api.getStats();
    } catch (e) {
      console.error(e);
    } finally {
      loading = false;
    }
  });
</script>

<div class="space-y-6">
  <h1 class="text-xl font-bold text-white">Analytics</h1>

  {#if loading}
    <LoadingSpinner />
  {:else if stats}
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">

      <!-- Activity by hour -->
      <div class="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <h2 class="text-sm font-semibold text-gray-300 mb-3">Activity by Hour</h2>
        <div class="flex items-end gap-1 h-24">
          {#each stats.hourCounts as count, hour}
            {@const max = Math.max(...stats.hourCounts, 1)}
            <div class="flex-1 flex flex-col items-center gap-1">
              <div
                class="w-full bg-blue-600/60 hover:bg-blue-500/80 rounded-sm transition-colors"
                style:height="{Math.max(2, (count / max) * 80)}px"
                title="{hour}:00 - {count} sessions"
              ></div>
              {#if hour % 6 === 0}
                <div class="text-[9px] text-gray-600">{hour}h</div>
              {:else}
                <div class="text-[9px] text-transparent">·</div>
              {/if}
            </div>
          {/each}
        </div>
      </div>

      <!-- Model usage table -->
      <div class="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <h2 class="text-sm font-semibold text-gray-300 mb-3">Model Breakdown</h2>
        {#if stats.modelUsage.length > 0}
          <div class="space-y-3">
            {#each stats.modelUsage as m}
              {@const total = stats.modelUsage.reduce((s, u) => s + u.inputTokens + u.outputTokens, 0)}
              {@const pct = total > 0 ? ((m.inputTokens + m.outputTokens) / total) * 100 : 0}
              <div>
                <div class="flex items-center justify-between text-xs mb-1">
                  <span class="text-gray-400 font-mono">{m.model}</span>
                  <span class="text-gray-500">{pct.toFixed(1)}%</span>
                </div>
                <div class="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                  <div class="h-full bg-blue-500 rounded-full" style:width="{pct}%"></div>
                </div>
              </div>
            {/each}
          </div>
        {:else}
          <div class="text-gray-600 text-sm">No model data available</div>
        {/if}
      </div>

      <!-- Sessions per day -->
      <div class="bg-gray-900 border border-gray-800 rounded-xl p-4 lg:col-span-2">
        <h2 class="text-sm font-semibold text-gray-300 mb-3">Activity (Last 30 Days)</h2>
        {#each [stats.dailyActivity.slice(-30)] as recent}
          {#each [Math.max(...recent.map((d) => d.sessionCount), 1)] as max}
            <div class="flex items-end gap-1 h-32">
              {#each recent as day}
                <div class="flex-1 flex flex-col items-center gap-1">
                  <div
                    class="w-full bg-purple-600/60 hover:bg-purple-500/80 rounded-sm transition-colors"
                    style:height="{Math.max(day.sessionCount > 0 ? 2 : 0, (day.sessionCount / max) * 110)}px"
                    title="{day.date}: {day.sessionCount} sessions"
                  ></div>
                </div>
              {/each}
            </div>
            <div class="flex justify-between mt-1 text-[9px] text-gray-600">
              <span>{recent[0]?.date ?? ''}</span>
              <span>{recent[recent.length - 1]?.date ?? ''}</span>
            </div>
          {/each}
        {/each}
      </div>
    </div>

    <!-- Summary stats -->
    <div class="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <h2 class="text-sm font-semibold text-gray-300 mb-3">Summary</h2>
      <dl class="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <div>
          <dt class="text-gray-600 text-xs">Sessions this week</dt>
          <dd class="text-white font-bold text-lg">{stats.sessionsThisWeek}</dd>
        </div>
        <div>
          <dt class="text-gray-600 text-xs">Tokens today</dt>
          <dd class="text-white font-bold text-lg">
            {stats.tokensToday >= 1000 ? `${(stats.tokensToday / 1000).toFixed(0)}k` : stats.tokensToday}
          </dd>
        </div>
        <div>
          <dt class="text-gray-600 text-xs">Avg msgs/session</dt>
          <dd class="text-white font-bold text-lg">
            {stats.totalSessions > 0 ? Math.round(stats.totalMessages / stats.totalSessions) : 0}
          </dd>
        </div>
        <div>
          <dt class="text-gray-600 text-xs">Models used</dt>
          <dd class="text-white font-bold text-lg">{stats.modelUsage.length}</dd>
        </div>
      </dl>
    </div>
  {:else}
    <div class="text-gray-500">Failed to load analytics data</div>
  {/if}
</div>
