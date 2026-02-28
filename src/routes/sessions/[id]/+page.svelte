<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { api } from '$lib/api/client.js';
  import type { SessionDetail } from '$shared/types.js';
  import MessageCard from '$lib/components/session/MessageCard.svelte';
  import LoadingSpinner from '$lib/components/shared/LoadingSpinner.svelte';
  import Badge from '$lib/components/shared/Badge.svelte';

  const id = $derived($page.params.id);

  let session = $state<SessionDetail | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let replayStep = $state(-1); // -1 = show all
  let replayMode = $state(false);

  onMount(async () => {
    try {
      session = await api.getSession(id);
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load session';
    } finally {
      loading = false;
    }
  });

  function formatDuration(ms: number): string {
    if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
    if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
    return `${(ms / 3_600_000).toFixed(1)}h`;
  }

  function formatTokens(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1000).toFixed(0)}k`;
    return String(n);
  }

  const visibleMessages = $derived(
    session?.messages
      ? (replayMode && replayStep >= 0
          ? session.messages.slice(0, replayStep + 1)
          : session.messages)
      : []
  );

  function startReplay() {
    replayMode = true;
    replayStep = 0;
  }

  function stopReplay() {
    replayMode = false;
    replayStep = -1;
  }
</script>

<div class="space-y-4 h-full flex flex-col">
  {#if loading}
    <LoadingSpinner />
  {:else if error}
    <div class="text-red-400">{error}</div>
  {:else if session}
    <!-- Header -->
    <div class="flex items-start gap-4">
      <div class="flex-1">
        <div class="flex items-center gap-2 flex-wrap">
          <Badge label={session.projectName} color="blue" />
          {#if session.gitBranch && session.gitBranch !== 'HEAD'}
            <Badge label={session.gitBranch} color="purple" />
          {/if}
          {#if session.model !== 'unknown'}
            <Badge label={session.model} color="gray" />
          {/if}
          {#each session.prLinks as link}
            <a href={link} target="_blank" rel="noopener" class="text-xs text-blue-400 hover:underline">PR Link</a>
          {/each}
        </div>
        <p class="mt-2 text-sm text-gray-400 line-clamp-2">{session.firstUserPrompt}</p>
      </div>
      <div class="shrink-0 text-right text-xs text-gray-500 space-y-1">
        <div>{new Date(session.firstTimestamp).toLocaleString()}</div>
        <div>Duration: {formatDuration(session.durationMs)}</div>
        <div>{session.messageCount} messages · {session.toolCallCount} tools · {session.editCount} edits</div>
        <div>
          {formatTokens(session.tokenUsage.input_tokens + session.tokenUsage.output_tokens)} tokens
          {#if session.estimatedCost > 0}
            · ${session.estimatedCost.toFixed(4)}
          {/if}
        </div>
        <div class="flex gap-2 justify-end mt-2">
          <a
            href="/diffs/{session.id}"
            class="px-3 py-1 bg-gray-800 border border-gray-700 rounded text-xs hover:bg-gray-700"
          >
            View Diffs
          </a>
        </div>
      </div>
    </div>

    <!-- Replay controls -->
    <div class="flex items-center gap-3">
      {#if !replayMode}
        <button
          onclick={startReplay}
          class="flex items-center gap-1.5 px-3 py-1.5 bg-blue-700/30 border border-blue-600/40 rounded text-xs text-blue-300 hover:bg-blue-700/50"
        >
          <svg class="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
            <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
          </svg>
          Replay
        </button>
      {:else}
        <button onclick={stopReplay} class="px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-xs text-gray-300 hover:bg-gray-700">
          Show All
        </button>
        <input
          type="range"
          min="0"
          max={session.messages.length - 1}
          bind:value={replayStep}
          class="flex-1 accent-blue-500"
        />
        <span class="text-xs text-gray-500">{replayStep + 1}/{session.messages.length}</span>
      {/if}
    </div>

    <!-- Messages -->
    <div class="flex-1 space-y-3 overflow-auto pb-4">
      {#each visibleMessages as message (message.uuid)}
        <div class="animate-in fade-in duration-200">
          <MessageCard {message} />
        </div>
      {/each}
    </div>
  {/if}
</div>
