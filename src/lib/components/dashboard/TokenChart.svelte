<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { DailyActivity } from '$shared/types.js';

  let { activity }: { activity: DailyActivity[] } = $props();
  let canvas: HTMLCanvasElement;
  let chart: unknown;

  onMount(async () => {
    const { Chart, registerables } = await import('chart.js');
    const { default: adapter } = await import('chartjs-adapter-date-fns');
    Chart.register(...registerables);

    // Take last 30 days
    const recent = activity.slice(-30);

    chart = new Chart(canvas, {
      type: 'line',
      data: {
        labels: recent.map((d) => d.date),
        datasets: [
          {
            label: 'Tokens',
            data: recent.map((d) => d.tokenCount),
            borderColor: '#3b82f6',
            backgroundColor: '#3b82f610',
            fill: true,
            tension: 0.3,
            pointRadius: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: '#9ca3af', font: { size: 11 } } },
        },
        scales: {
          x: {
            type: 'time',
            time: { unit: 'day' },
            ticks: { color: '#6b7280', maxTicksLimit: 8 },
            grid: { color: '#1f2937' },
          },
          y: {
            ticks: { color: '#6b7280' },
            grid: { color: '#1f2937' },
          },
        },
      },
    });
  });

  onDestroy(() => {
    if (chart) (chart as { destroy: () => void }).destroy();
  });
</script>

<canvas bind:this={canvas} class="w-full" style:height="200px"></canvas>
