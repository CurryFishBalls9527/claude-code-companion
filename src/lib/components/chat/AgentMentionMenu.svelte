<script lang="ts">
  import type { AgentInfo } from '$lib/stores/chat.js';

  let {
    agents = [],
    filter = '',
    onSelect,
  }: {
    agents: AgentInfo[];
    filter: string;
    onSelect: (agent: AgentInfo) => void;
  } = $props();

  let selectedIndex = $state(0);

  const filtered = $derived(
    filter
      ? agents.filter(a => a.name.toLowerCase().includes(filter.toLowerCase()))
      : agents
  );

  $effect(() => {
    filter;
    selectedIndex = 0;
  });

  export function handleKeydown(e: KeyboardEvent): boolean {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedIndex = Math.min(selectedIndex + 1, filtered.length - 1);
      return true;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedIndex = Math.max(selectedIndex - 1, 0);
      return true;
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      if (filtered[selectedIndex]) onSelect(filtered[selectedIndex]);
      return true;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      return true;
    }
    return false;
  }
</script>

{#if filtered.length > 0}
  <div class="absolute bottom-full left-0 right-0 mb-1 mx-3 bg-gray-800 border border-gray-700 rounded-lg shadow-xl max-h-64 overflow-auto z-50">
    {#each filtered as agent, i}
      <button
        class="w-full text-left px-3 py-2 flex items-center gap-3 text-sm transition-colors
               {i === selectedIndex ? 'bg-gray-700/60 text-white' : 'text-gray-300 hover:bg-gray-700/30'}"
        onmouseenter={() => selectedIndex = i}
        onclick={() => onSelect(agent)}
      >
        <span class="font-mono text-purple-400 text-xs">@{agent.name}</span>
        {#if agent.description}
          <span class="text-xs text-gray-500 truncate">{agent.description}</span>
        {/if}
      </button>
    {/each}
  </div>
{/if}
