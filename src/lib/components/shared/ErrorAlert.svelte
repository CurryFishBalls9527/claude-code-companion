<script lang="ts">
  let { message, onRetry }: { message: string; onRetry?: () => void } = $props();
</script>

<div class="rounded-lg border border-red-800/50 bg-red-950/30 p-4 flex items-start gap-3">
  <svg class="h-5 w-5 text-red-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
  </svg>
  <div class="flex-1 min-w-0">
    <p class="text-sm text-red-300">{message}</p>
    {#if onRetry}
      <button
        onclick={onRetry}
        class="mt-2 text-xs text-red-400 hover:text-red-300 underline"
      >
        Try again
      </button>
    {/if}
  </div>
</div>
