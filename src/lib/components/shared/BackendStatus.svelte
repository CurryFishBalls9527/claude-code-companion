<script lang="ts">
  import { onMount, onDestroy } from 'svelte';

  let reachable = $state(true);
  let checking = $state(false);
  let interval: ReturnType<typeof setInterval>;

  async function check() {
    if (checking) return;
    checking = true;
    try {
      const res = await fetch('/api/health', { signal: AbortSignal.timeout(3000) });
      reachable = res.ok;
    } catch {
      reachable = false;
    } finally {
      checking = false;
    }
  }

  onMount(() => {
    check();
    interval = setInterval(check, 10_000);
  });

  onDestroy(() => clearInterval(interval));
</script>

{#if !reachable}
  <div class="bg-red-900/80 border-b border-red-800 px-4 py-2 flex items-center gap-2 text-xs text-red-200">
    <div class="h-2 w-2 rounded-full bg-red-400 animate-pulse"></div>
    Backend unavailable — run
    <code class="bg-red-950/50 px-1.5 py-0.5 rounded font-mono">npm run dev:backend</code>
    to reconnect
  </div>
{/if}
