<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '$lib/api/client.js';
  import type { DashboardStats, ToolTiming, CostBudget } from '$shared/types.js';
  import LoadingSpinner from '$lib/components/shared/LoadingSpinner.svelte';

  let stats = $state<DashboardStats | null>(null);
  let toolTiming = $state<ToolTiming[]>([]);
  let loading = $state(true);

  // Budget settings
  let budgets = $state<CostBudget>({});
  let budgetEditing = $state(false);
  let budgetDaily = $state('');
  let budgetWeekly = $state('');
  let budgetMonthly = $state('');
  let savingBudgets = $state(false);

  onMount(async () => {
    try {
      [stats, toolTiming, budgets] = await Promise.all([
        api.getStats(),
        api.getToolTiming().catch(() => []),
        api.getBudgets().catch(() => ({})),
      ]);
      budgetDaily = budgets.daily ? String(budgets.daily) : '';
      budgetWeekly = budgets.weekly ? String(budgets.weekly) : '';
      budgetMonthly = budgets.monthly ? String(budgets.monthly) : '';
    } catch (e) {
      console.error(e);
    } finally {
      loading = false;
    }
  });

  async function saveBudgets() {
    savingBudgets = true;
    try {
      budgets = await api.updateBudgets({
        daily: budgetDaily ? Number(budgetDaily) : undefined,
        weekly: budgetWeekly ? Number(budgetWeekly) : undefined,
        monthly: budgetMonthly ? Number(budgetMonthly) : undefined,
      });
      budgetEditing = false;
    } finally {
      savingBudgets = false;
    }
  }

  // Normalize hourCounts — API may return sparse object {hour: count} instead of 24-element array
  const hourCounts = $derived.by(() => {
    const raw = stats?.hourCounts;
    if (!raw) return new Array(24).fill(0);
    if (Array.isArray(raw) && raw.length === 24) return raw;
    const arr = new Array(24).fill(0);
    if (Array.isArray(raw)) return raw;
    for (const [h, c] of Object.entries(raw as Record<string, number>)) {
      const idx = parseInt(h, 10);
      if (idx >= 0 && idx < 24) arr[idx] = c;
    }
    return arr;
  });

  const maxToolMs = $derived(Math.max(...toolTiming.map((t) => t.avgMs), 1));

  function fmtMs(ms: number): string {
    if (ms >= 60_000) return `${(ms / 60_000).toFixed(1)}m`;
    if (ms >= 1_000) return `${(ms / 1_000).toFixed(1)}s`;
    return `${Math.round(ms)}ms`;
  }
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
          {#each hourCounts as count, hour}
            {@const max = Math.max(...hourCounts, 1)}
            <div class="flex-1 flex flex-col items-center gap-1">
              <div
                class="w-full rounded-sm transition-colors {count > 0 ? 'bg-blue-600/60 hover:bg-blue-500/80' : 'bg-gray-800/40'}"
                style:height="{count > 0 ? Math.max(8, (count / max) * 80) : 2}px"
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

    <!-- Tool Timing -->
    {#if toolTiming.length > 0}
      <div class="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <h2 class="text-sm font-semibold text-gray-300 mb-4">Tool Performance (avg response time)</h2>
        <div class="space-y-2.5">
          {#each [...toolTiming].sort((a, b) => b.avgMs - a.avgMs) as t}
            <div class="flex items-center gap-3">
              <div class="w-32 shrink-0 text-xs font-mono text-gray-400 truncate text-right">{t.toolName}</div>
              <div class="flex-1 h-5 bg-gray-800 rounded overflow-hidden">
                <div
                  class="h-full bg-teal-600/70 rounded transition-all"
                  style:width="{(t.avgMs / maxToolMs) * 100}%"
                ></div>
              </div>
              <div class="w-20 shrink-0 text-right space-x-2">
                <span class="text-xs text-teal-400">{fmtMs(t.avgMs)}</span>
                <span class="text-xs text-gray-600">avg</span>
              </div>
              <div class="w-16 shrink-0 text-right">
                <span class="text-xs text-gray-600">{t.count}×</span>
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}

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

    <!-- Cost Budgets -->
    <div class="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-sm font-semibold text-gray-300">Cost Budgets</h2>
        <button
          onclick={() => (budgetEditing = !budgetEditing)}
          class="text-xs px-2 py-1 bg-gray-800 border border-gray-700 rounded text-gray-400 hover:text-gray-200 hover:bg-gray-700"
        >
          {budgetEditing ? 'Cancel' : 'Edit'}
        </button>
      </div>

      {#if budgetEditing}
        <div class="grid grid-cols-3 gap-3">
          {#each [
            { label: 'Daily ($)', bind: budgetDaily, key: 'daily' },
            { label: 'Weekly ($)', bind: budgetWeekly, key: 'weekly' },
            { label: 'Monthly ($)', bind: budgetMonthly, key: 'monthly' },
          ] as field}
            <div>
              <label class="block text-xs text-gray-500 mb-1">{field.label}</label>
              {#if field.key === 'daily'}
                <input type="number" min="0" step="0.01" bind:value={budgetDaily}
                  class="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-blue-500" />
              {:else if field.key === 'weekly'}
                <input type="number" min="0" step="0.01" bind:value={budgetWeekly}
                  class="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-blue-500" />
              {:else}
                <input type="number" min="0" step="0.01" bind:value={budgetMonthly}
                  class="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-blue-500" />
              {/if}
            </div>
          {/each}
        </div>
        <button
          onclick={saveBudgets}
          disabled={savingBudgets}
          class="mt-3 px-4 py-1.5 bg-blue-600 text-white rounded text-xs hover:bg-blue-500 disabled:opacity-50"
        >
          {savingBudgets ? 'Saving…' : 'Save Budgets'}
        </button>
      {:else}
        <div class="grid grid-cols-3 gap-4 text-sm">
          {#each [
            { label: 'Daily', value: budgets.daily },
            { label: 'Weekly', value: budgets.weekly },
            { label: 'Monthly', value: budgets.monthly },
          ] as b}
            <div class="bg-gray-800/50 rounded-lg px-3 py-2">
              <div class="text-xs text-gray-600">{b.label}</div>
              <div class="text-white font-medium mt-0.5">
                {#if b.value}
                  ${b.value.toFixed(2)}
                {:else}
                  <span class="text-gray-600 text-xs">not set</span>
                {/if}
              </div>
            </div>
          {/each}
        </div>
        {#if !budgets.daily && !budgets.weekly && !budgets.monthly}
          <p class="text-xs text-gray-600 mt-2">Set budget thresholds to see alerts on the dashboard.</p>
        {/if}
      {/if}
    </div>
  {:else}
    <div class="text-gray-500">Failed to load analytics data</div>
  {/if}
</div>
