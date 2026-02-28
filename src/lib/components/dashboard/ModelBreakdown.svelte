<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { ModelUsage } from '$shared/types.js';

  let { usage }: { usage: ModelUsage[] } = $props();
  let canvas: HTMLCanvasElement;
  let chart: unknown;

  const COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4'];

  onMount(async () => {
    if (!usage.length) return;
    const { Chart, registerables } = await import('chart.js');
    Chart.register(...registerables);

    chart = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: usage.map((u) => u.model),
        datasets: [
          {
            data: usage.map((u) => u.inputTokens + u.outputTokens),
            backgroundColor: COLORS.slice(0, usage.length),
            borderColor: '#111827',
            borderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'right',
            labels: { color: '#9ca3af', font: { size: 11 }, padding: 12 },
          },
        },
      },
    });
  });

  onDestroy(() => {
    if (chart) (chart as { destroy: () => void }).destroy();
  });
</script>

{#if usage.length > 0}
  <canvas bind:this={canvas} class="w-full" style:height="180px"></canvas>
{:else}
  <div class="flex items-center justify-center h-32 text-gray-600 text-sm">No model data</div>
{/if}
