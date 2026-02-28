<script lang="ts">
  let { thinking }: { thinking: string } = $props();
  let expanded = $state(false);
</script>

<div class="my-2">
  <button
    onclick={() => (expanded = !expanded)}
    class="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-400 transition-colors"
  >
    <svg
      class="h-3 w-3 transition-transform {expanded ? 'rotate-90' : ''}"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
    </svg>
    <span class="italic">Thinking ({thinking.length} chars)</span>
  </button>

  {#if expanded}
    <div class="mt-2 pl-4 border-l-2 border-gray-700 text-xs text-gray-500 italic leading-relaxed whitespace-pre-wrap font-mono max-h-80 overflow-auto">
      {thinking}
    </div>
  {/if}
</div>
