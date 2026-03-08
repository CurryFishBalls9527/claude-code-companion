<script lang="ts">
  import '../app.css';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import type { Snippet } from 'svelte';
  import BackendStatus from '$lib/components/shared/BackendStatus.svelte';
  import { theme } from '$lib/stores/theme.js';
  import CommandPalette from '$lib/components/shared/CommandPalette.svelte';

  let paletteOpen = $state(false);

  function handleGlobalKey(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      paletteOpen = !paletteOpen;
    }
  }

  let { children }: { children: Snippet } = $props();

  const navItems = [
    { href: '/chat', label: 'Chat', icon: 'M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z' },
    { href: '/', label: 'Dashboard', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
    { href: '/sessions', label: 'Sessions', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
{ href: '/analytics', label: 'Analytics', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
    { href: '/live', label: 'Live', icon: 'M5.636 18.364a9 9 0 010-12.728m12.728 0a9 9 0 010 12.728m-9.9-2.829a5 5 0 010-7.07m7.072 0a5 5 0 010 7.07M13 12a1 1 0 11-2 0 1 1 0 012 0z' },
    { href: '/search', label: 'Search', icon: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z' },
    { href: '/files', label: 'Files', icon: 'M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z' },
    { href: '/settings', label: 'Settings', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z' },
  ];

  let searchValue = $state('');

  function handleSearch(e: KeyboardEvent) {
    if (e.key === 'Enter' && searchValue.trim()) {
      goto(`/search?q=${encodeURIComponent(searchValue.trim())}`);
    }
  }

  function isActive(href: string): boolean {
    if (href === '/') return $page.url.pathname === '/';
    return $page.url.pathname.startsWith(href);
  }
</script>

<svelte:window onkeydown={handleGlobalKey} />
<CommandPalette bind:open={paletteOpen} />

<div class="flex h-screen bg-gray-950 text-gray-100 overflow-hidden">
  <!-- Sidebar -->
  <nav class="w-52 bg-gray-900 border-r border-gray-800 flex flex-col shrink-0">
    <div class="px-4 py-5 border-b border-gray-800">
      <div class="text-base font-bold text-white">Claude Dashboard</div>
      <div class="text-xs text-gray-500 mt-0.5">Code companion</div>
    </div>

    <div class="flex-1 py-3 px-2 space-y-0.5 overflow-auto">
      {#each navItems as item}
        <a
          href={item.href}
          class="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors {isActive(item.href)
            ? 'bg-blue-600/20 text-blue-400 font-medium'
            : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'}"
        >
          <svg class="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d={item.icon} />
          </svg>
          {item.label}
        </a>
      {/each}
    </div>
    <!-- Theme toggle at bottom of sidebar -->
    <div class="p-3 border-t border-gray-800 shrink-0">
      <button
        onclick={() => theme.toggle()}
        class="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-gray-500 hover:text-gray-300 hover:bg-gray-800 transition-colors"
      >
        {#if $theme === 'dark'}
          <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
          Light mode
        {:else}
          <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
          </svg>
          Dark mode
        {/if}
      </button>
    </div>
  </nav>

  <!-- Main content -->
  <div class="flex-1 flex flex-col overflow-hidden">
    <BackendStatus />
    <header class="bg-gray-900 border-b border-gray-800 px-5 py-3 flex items-center gap-3 shrink-0">
      <button
        onclick={() => (paletteOpen = true)}
        class="flex items-center gap-2 flex-1 max-w-lg bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-500 hover:border-gray-600 transition-colors"
      >
        <svg class="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <span class="flex-1 text-left">Search commands or sessions...</span>
        <kbd class="text-xs bg-gray-700 border border-gray-600 rounded px-1.5 py-0.5 shrink-0">⌘K</kbd>
      </button>
    </header>

    <main class="flex-1 {$page.url.pathname.startsWith('/chat') ? 'overflow-hidden' : 'overflow-auto p-5'}">
      {@render children()}
    </main>
  </div>
</div>
