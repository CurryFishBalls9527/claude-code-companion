<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { DailyActivity } from '$shared/types.js';

  let { activity }: { activity: DailyActivity[] } = $props();
  let canvas: HTMLCanvasElement;
  let chart: unknown;

  onMount(async () => {
    const { Chart, registerables } = await import('chart.js');
    await import('chartjs-adapter-date-fns');
    Chart.register(...registerables);

    const recent = activity.slice(-30);
    const rawMax = Math.max(...recent.map((d) => d.tokenCount), 0);

    // Pick unit: show raw numbers if small, k if medium, M if large
    let unitLabel: string;
    let divisor: number;
    if (rawMax >= 10_000_000) {
      unitLabel = 'M';
      divisor = 1_000_000;
    } else if (rawMax >= 10_000) {
      unitLabel = 'k';
      divisor = 1_000;
    } else {
      unitLabel = '';
      divisor = 1;
    }

    const data = recent.map((d) => d.tokenCount / divisor);

    chart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: recent.map((d) => d.date),
        datasets: [
          {
            label: `Tokens${unitLabel ? ` (${unitLabel})` : ''}`,
            data,
            backgroundColor: '#3b82f6',
            borderRadius: 2,
            barPercentage: 0.6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
        },
        scales: {
          x: {
            type: 'time',
            time: { unit: 'day' },
            ticks: { color: '#6b7280', maxTicksLimit: 7, font: { size: 10 } },
            grid: { display: false },
          },
          y: {
            beginAtZero: true,
            ticks: {
              color: '#6b7280',
              maxTicksLimit: 5,
              font: { size: 10 },
              callback: (value: number | string) => {
                const n = typeof value === 'number' ? value : parseFloat(String(value));
                return `${Number.isInteger(n) ? n : n.toFixed(1)}${unitLabel}`;
              },
            },
            grid: { color: '#1f293740' },
          },
        },
      },
    });
  });

  onDestroy(() => {
    if (chart) (chart as { destroy: () => void }).destroy();
  });
</script>

<div class="w-full" style="height: 160px;">
  <canvas bind:this={canvas} class="w-full h-full"></canvas>
</div>
