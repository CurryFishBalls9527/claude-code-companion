<script lang="ts">
  import { goto } from '$app/navigation';
  import { theme } from '$lib/stores/theme.js';
  import { api } from '$lib/api/client.js';
  import type { SessionSummary } from '$shared/types.js';

  let { open = $bindable(false) }: { open: boolean } = $props();

  let query = $state('');
  let selected = $state(0);
  let sessionResults = $state<SessionSummary[]>([]);
  let searching = $state(false);
  let debounceTimer: ReturnType<typeof setTimeout>;

  type Command = { label: string; description?: string; action: () => void; icon?: string };

  const staticCommands: Command[] = [
    { label: 'Dashboard', description: 'Go to home dashboard', icon: '🏠', action: () => goto('/') },
    { label: 'Sessions', description: 'Browse all sessions', icon: '📋', action: () => goto('/sessions') },
{ label: 'Analytics', description: 'Usage analytics', icon: '📊', action: () => goto('/analytics') },
    { label: 'Live', description: 'Live session monitor', icon: '⚡', action: () => goto('/live') },
    { label: 'Search', description: 'Search all sessions', icon: '🔍', action: () => goto('/search') },
    { label: 'Files', description: 'File edit timeline', icon: '📁', action: () => goto('/files') },
    { label: 'Toggle theme', description: 'Switch dark/light mode', icon: '🌓', action: () => theme.toggle() },
  ];

  const filteredStatic = $derived(
    query
      ? staticCommands.filter(
          (c) =>
            c.label.toLowerCase().includes(query.toLowerCase()) ||
            c.description?.toLowerCase().includes(query.toLowerCase())
        )
      : staticCommands
  );

  const allResults = $derived([
    ...filteredStatic.map((c) => ({ type: 'command' as const, command: c, session: null })),
    ...sessionResults.map((s) => ({ type: 'session' as const, command: null, session: s })),
  ]);

  $effect(() => {
    if (query.length >= 2) {
      clearTimeout(debounceTimer);
      searching = true;
      debounceTimer = setTimeout(async () => {
        try {
          const res = await api.getSessions({ limit: 5 });
          sessionResults = res.sessions.filter(
            (s) => s.firstUserPrompt.toLowerCase().includes(query.toLowerCase()) ||
                   s.projectName.toLowerCase().includes(query.toLowerCase())
          );
        } catch {
          sessionResults = [];
        } finally {
          searching = false;
        }
      }, 200);
    } else {
      sessionResults = [];
    }
  });

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selected = Math.min(selected + 1, allResults.length - 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selected = Math.max(selected - 1, 0);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = allResults[selected];
      if (item?.type === 'command') item.command?.action();
      else if (item?.type === 'session') goto(`/sessions/${item.session?.id}`);
      close();
    } else if (e.key === 'Escape') {
      close();
    }
  }

  function close() {
    open = false;
    query = '';
    selected = 0;
    sessionResults = [];
  }

  function selectAndRun(item: (typeof allResults)[0]) {
    if (item.type === 'command') item.command?.action();
    else goto(`/sessions/${item.session?.id}`);
    close();
  }
</script>

{#if open}
  <!-- Backdrop -->
  <div
    class="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
    role="presentation"
    onclick={close}
  ></div>

  <!-- Palette -->
  <div class="fixed inset-x-0 top-24 z-50 mx-auto max-w-xl px-4">
    <div class="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl overflow-hidden">
      <!-- Input -->
      <div class="flex items-center gap-3 px-4 py-3 border-b border-gray-800">
        <svg class="h-4 w-4 text-gray-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          bind:value={query}
          onkeydown={handleKeydown}
          placeholder="Search commands or sessions..."
          autofocus
          class="flex-1 bg-transparent text-sm text-gray-200 placeholder-gray-500 outline-none"
        />
        <kbd class="text-xs text-gray-600 bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5">Esc</kbd>
      </div>

      <!-- Results -->
      <div class="max-h-80 overflow-auto py-1">
        {#if allResults.length === 0 && !searching}
          <div class="px-4 py-8 text-center text-sm text-gray-600">No results</div>
        {:else}
          {#each allResults as item, i}
            <button
              class="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors {i === selected ? 'bg-blue-600/20 text-blue-300' : 'hover:bg-gray-800 text-gray-300'}"
              onclick={() => selectAndRun(item)}
              onmouseenter={() => (selected = i)}
            >
              {#if item.type === 'command'}
                <span class="text-base">{item.command?.icon}</span>
                <div class="flex-1 min-w-0">
                  <div class="text-sm font-medium">{item.command?.label}</div>
                  {#if item.command?.description}
                    <div class="text-xs text-gray-500">{item.command.description}</div>
                  {/if}
                </div>
              {:else if item.session}
                <span class="text-base">💬</span>
                <div class="flex-1 min-w-0">
                  <div class="text-sm truncate">{item.session.firstUserPrompt}</div>
                  <div class="text-xs text-gray-500">{item.session.projectName}</div>
                </div>
              {/if}
            </button>
          {/each}
        {/if}
      </div>

      <div class="px-4 py-2 border-t border-gray-800 flex gap-4 text-[10px] text-gray-600">
        <span><kbd class="bg-gray-800 border border-gray-700 rounded px-1">↑↓</kbd> navigate</span>
        <span><kbd class="bg-gray-800 border border-gray-700 rounded px-1">↵</kbd> select</span>
        <span><kbd class="bg-gray-800 border border-gray-700 rounded px-1">Esc</kbd> close</span>
      </div>
    </div>
  </div>
{/if}
