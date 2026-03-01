<script lang="ts">
  import type { SlashCommand } from '$lib/stores/chat.js';

  let {
    commands = [],
    filter = '',
    onSelect,
  }: {
    commands: SlashCommand[];
    filter: string;
    onSelect: (command: SlashCommand) => void;
  } = $props();

  let selectedIndex = $state(0);

  // Built-in client-side commands
  const builtInCommands: SlashCommand[] = [
    { name: 'plan', description: 'Switch to plan (read-only) mode', isBuiltIn: true },
    { name: 'default', description: 'Switch to default permission mode', isBuiltIn: true },
    { name: 'yolo', description: 'Switch to bypass all permissions', isBuiltIn: true },
    { name: 'stop', description: 'Interrupt current response', isBuiltIn: true },
    { name: 'clear', description: 'Clear chat messages (visual only)', isBuiltIn: true },
    { name: 'new', description: 'End session and start fresh', isBuiltIn: true },
  ];

  const allCommands = $derived([...builtInCommands, ...commands]);

  const filtered = $derived(
    filter
      ? allCommands.filter(c => c.name.toLowerCase().includes(filter.toLowerCase()))
      : allCommands
  );

  // Reset selection when filter changes
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
      return true; // caller should close menu
    }
    return false;
  }
</script>

{#if filtered.length > 0}
  <div class="absolute bottom-full left-0 right-0 mb-1 mx-3 bg-gray-800 border border-gray-700 rounded-lg shadow-xl max-h-64 overflow-auto z-50">
    {#each filtered as cmd, i}
      <button
        class="w-full text-left px-3 py-2 flex items-center gap-3 text-sm transition-colors
               {i === selectedIndex ? 'bg-gray-700/60 text-white' : 'text-gray-300 hover:bg-gray-700/30'}"
        onmouseenter={() => selectedIndex = i}
        onclick={() => onSelect(cmd)}
      >
        <span class="font-mono text-blue-400 text-xs">/{cmd.name}</span>
        {#if cmd.description}
          <span class="text-xs text-gray-500 truncate">{cmd.description}</span>
        {/if}
        {#if cmd.isBuiltIn}
          <span class="ml-auto text-[10px] text-gray-600">built-in</span>
        {/if}
      </button>
    {/each}
  </div>
{/if}
