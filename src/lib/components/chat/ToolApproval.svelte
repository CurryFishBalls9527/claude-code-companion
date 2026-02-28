<script lang="ts">
  let {
    toolName,
    toolId,
    input,
    onApprove,
  }: {
    toolName: string;
    toolId: string;
    input: Record<string, unknown>;
    onApprove: (toolId: string, approved: boolean) => void;
  } = $props();

  let expanded = $state(false);
  const inputJson = $derived(JSON.stringify(input, null, 2));
</script>

<div class="border border-yellow-700/60 bg-yellow-900/10 rounded-xl p-4 space-y-3">
  <div class="flex items-center gap-2">
    <svg class="h-4 w-4 text-yellow-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
      <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.07 16.5c-.77.833.192 2.5 1.732 2.5z" />
    </svg>
    <span class="text-sm font-medium text-yellow-300">Tool permission required</span>
  </div>

  <div>
    <div class="flex items-center gap-2 mb-2">
      <span class="text-xs font-mono px-2 py-0.5 bg-yellow-800/40 text-yellow-300 rounded">{toolName}</span>
      <button
        onclick={() => (expanded = !expanded)}
        class="text-xs text-gray-500 hover:text-gray-300"
      >
        {expanded ? 'hide' : 'show'} input
      </button>
    </div>

    {#if expanded}
      <pre class="text-xs font-mono text-gray-400 bg-gray-900 rounded-lg p-3 overflow-auto max-h-48 whitespace-pre-wrap">{inputJson}</pre>
    {:else}
      <!-- Show a short summary -->
      <p class="text-xs text-gray-500 font-mono truncate">
        {Object.entries(input).slice(0, 2).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(', ')}
      </p>
    {/if}
  </div>

  <div class="flex gap-2">
    <button
      onclick={() => onApprove(toolId, true)}
      class="flex items-center gap-1.5 px-4 py-1.5 bg-green-700 hover:bg-green-600 text-white text-sm rounded-lg transition-colors"
    >
      <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
        <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
      </svg>
      Allow
    </button>
    <button
      onclick={() => onApprove(toolId, false)}
      class="flex items-center gap-1.5 px-4 py-1.5 bg-red-800/60 hover:bg-red-700/60 text-red-300 text-sm rounded-lg border border-red-700/50 transition-colors"
    >
      <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
        <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
      </svg>
      Deny
    </button>
  </div>
</div>
