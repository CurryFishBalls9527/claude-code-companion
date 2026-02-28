<script lang="ts">
  import type { StreamingState } from '$lib/stores/chat.js';
  import MarkdownRenderer from '$lib/components/shared/MarkdownRenderer.svelte';

  let { streaming }: { streaming: StreamingState } = $props();

  let thinkingExpanded = $state(false);
</script>

<div class="space-y-3">
  <!-- Thinking block -->
  {#if streaming.thinking}
    <div class="border border-gray-700/50 rounded-lg overflow-hidden">
      <button
        onclick={() => (thinkingExpanded = !thinkingExpanded)}
        class="w-full flex items-center gap-2 px-3 py-2 bg-gray-800/50 text-xs text-gray-500 hover:text-gray-300 text-left"
      >
        <svg class="h-3 w-3 shrink-0 transition-transform {thinkingExpanded ? 'rotate-90' : ''}" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        Thinking…
      </button>
      {#if thinkingExpanded}
        <div class="px-3 py-2 text-xs text-gray-500 font-mono whitespace-pre-wrap leading-relaxed max-h-48 overflow-auto">
          {streaming.thinking}
        </div>
      {/if}
    </div>
  {/if}

  <!-- Text response -->
  {#if streaming.text}
    <div class="text-sm text-gray-200 leading-relaxed">
      <MarkdownRenderer content={streaming.text} />
    </div>
  {/if}

  <!-- In-progress tool calls -->
  {#each streaming.toolCalls as tc}
    <div class="border border-gray-700 rounded-lg overflow-hidden">
      <div class="flex items-center gap-2 px-3 py-2 bg-gray-800/60">
        <span class="text-xs font-mono text-blue-400">{tc.name}</span>
        {#if tc.result !== undefined}
          <span class="text-xs text-green-500 ml-auto">{tc.isError ? '✗ error' : '✓ done'}</span>
        {:else}
          <span class="text-xs text-gray-500 ml-auto animate-pulse">running…</span>
        {/if}
      </div>
    </div>
  {/each}

  <!-- Responding indicator -->
  {#if !streaming.text && !streaming.thinking && streaming.toolCalls.length === 0}
    <div class="flex items-center gap-2 text-xs text-gray-500">
      <span class="inline-block w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
      Responding…
    </div>
  {/if}
</div>
