<script lang="ts">
  import type { DailyActivity } from '$shared/types.js';

  let { activity }: { activity: DailyActivity[] } = $props();

  // Group activity into weeks (columns of 7 days)
  const weeks = $derived(() => {
    if (!activity.length) return [];
    const result: DailyActivity[][] = [];
    let currentWeek: DailyActivity[] = [];

    for (const day of activity) {
      currentWeek.push(day);
      if (currentWeek.length === 7) {
        result.push(currentWeek);
        currentWeek = [];
      }
    }
    if (currentWeek.length > 0) result.push(currentWeek);
    return result;
  });

  const maxCount = $derived(Math.max(...activity.map((d) => d.messageCount), 1));

  function getColor(count: number): string {
    if (count === 0) return '#1f2937';
    const intensity = Math.min(count / maxCount, 1);
    if (intensity < 0.25) return '#1d4ed8';
    if (intensity < 0.5) return '#2563eb';
    if (intensity < 0.75) return '#3b82f6';
    return '#60a5fa';
  }

  const dayLabels = ['Mon', '', 'Wed', '', 'Fri', '', 'Sun'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  let tooltip = $state<{ text: string; x: number; y: number } | null>(null);

  function showTooltip(e: MouseEvent, day: DailyActivity) {
    tooltip = {
      text: `${day.date}: ${day.messageCount} messages`,
      x: (e.target as HTMLElement).getBoundingClientRect().left,
      y: (e.target as HTMLElement).getBoundingClientRect().top - 30,
    };
  }
</script>

<div class="overflow-x-auto">
  <div class="flex gap-1 min-w-max">
    <!-- Day labels -->
    <div class="flex flex-col gap-1 mr-1">
      {#each dayLabels as label}
        <div class="h-3 w-6 text-[9px] text-gray-600 text-right leading-none pt-0.5">{label}</div>
      {/each}
    </div>

    <!-- Weeks -->
    {#each weeks() as week}
      <div class="flex flex-col gap-1">
        {#each week as day}
          <div
            role="tooltip"
            class="h-3 w-3 rounded-sm cursor-pointer hover:ring-1 hover:ring-blue-400"
            style:background={getColor(day.messageCount)}
            onmouseenter={(e) => showTooltip(e, day)}
            onmouseleave={() => (tooltip = null)}
          ></div>
        {/each}
      </div>
    {/each}
  </div>

  {#if tooltip}
    <div
      class="fixed z-50 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 pointer-events-none"
      style:left="{tooltip.x}px"
      style:top="{tooltip.y}px"
    >
      {tooltip.text}
    </div>
  {/if}
</div>
