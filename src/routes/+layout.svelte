<script lang="ts">
  import '../app.css';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import type { Snippet } from 'svelte';

  let { children }: { children: Snippet } = $props();

  const navItems = [
    { href: '/', label: 'Dashboard', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
    { href: '/sessions', label: 'Sessions', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
    { href: '/diffs', label: 'Diffs', icon: 'M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4' },
    { href: '/analytics', label: 'Analytics', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
    { href: '/live', label: 'Live', icon: 'M5.636 18.364a9 9 0 010-12.728m12.728 0a9 9 0 010 12.728m-9.9-2.829a5 5 0 010-7.07m7.072 0a5 5 0 010 7.07M13 12a1 1 0 11-2 0 1 1 0 012 0z' },
    { href: '/search', label: 'Search', icon: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z' },
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

<div class="flex h-screen bg-gray-950 text-gray-100 overflow-hidden">
  <!-- Sidebar -->
  <nav class="w-52 bg-gray-900 border-r border-gray-800 flex flex-col shrink-0">
    <div class="px-4 py-5 border-b border-gray-800">
      <div class="text-base font-bold text-white">Claude Dashboard</div>
      <div class="text-xs text-gray-500 mt-0.5">Code companion</div>
    </div>

    <div class="flex-1 py-3 px-2 space-y-0.5">
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
  </nav>

  <!-- Main content -->
  <div class="flex-1 flex flex-col overflow-hidden">
    <header class="bg-gray-900 border-b border-gray-800 px-5 py-3 flex items-center gap-3 shrink-0">
      <div class="relative flex-1 max-w-lg">
        <svg class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="search"
          placeholder="Search sessions... (Enter)"
          bind:value={searchValue}
          onkeydown={handleSearch}
          class="w-full bg-gray-800 border border-gray-700 rounded-lg pl-9 pr-4 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500"
        />
      </div>
    </header>

    <main class="flex-1 overflow-auto p-5">
      {@render children()}
    </main>
  </div>
</div>
