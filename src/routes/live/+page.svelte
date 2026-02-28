<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { api } from '$lib/api/client.js';
  import { getWsClient } from '$lib/api/websocket.js';
  import type { SessionDetail, ProcessedMessage } from '$shared/types.js';
  import MessageCard from '$lib/components/session/MessageCard.svelte';
  import LoadingSpinner from '$lib/components/shared/LoadingSpinner.svelte';

  let sessionId = $state<string | null>(null);
  let session = $state<SessionDetail | null>(null);
  let messages = $state<ProcessedMessage[]>([]);
  let loading = $state(true);
  let connected = $state(false);
  let autoScroll = $state(true);
  let messagesDiv: HTMLElement;

  let unsubscribe: (() => void) | null = null;

  onMount(async () => {
    try {
      const { sessionId: activeId } = await api.getActiveSession();
      if (!activeId) {
        loading = false;
        return;
      }

      sessionId = activeId;
      session = await api.getSession(activeId);
      messages = [...(session.messages ?? [])];
      loading = false;

      // Connect WebSocket for live updates
      const ws = getWsClient();
      unsubscribe = ws.subscribe(activeId, (entries) => {
        connected = true;
        // Parse new entries and add as messages (simplified - just show raw)
        const newMsgs: ProcessedMessage[] = entries
          .filter((e) => e.type === 'assistant' || e.type === 'user')
          .map((e) => ({
            uuid: e.uuid,
            parentUuid: e.parentUuid,
            timestamp: e.timestamp,
            role: e.type as 'user' | 'assistant',
            userText: e.type === 'user' ? '[new message]' : undefined,
            text: e.type === 'assistant' ? '[new response]' : undefined,
          }));

        if (newMsgs.length > 0) {
          messages = [...messages, ...newMsgs];
          if (autoScroll) {
            requestAnimationFrame(scrollToBottom);
          }
        }
      });

      ws.connect();
      connected = true;
      scrollToBottom();
    } catch (e) {
      console.error(e);
      loading = false;
    }
  });

  onDestroy(() => {
    unsubscribe?.();
  });

  function scrollToBottom() {
    if (messagesDiv) {
      messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }
  }

  function handleScroll() {
    if (!messagesDiv) return;
    const { scrollTop, scrollHeight, clientHeight } = messagesDiv;
    autoScroll = scrollHeight - scrollTop - clientHeight < 50;
  }
</script>

<div class="h-full flex flex-col space-y-4">
  <div class="flex items-center justify-between shrink-0">
    <h1 class="text-xl font-bold text-white">Live Session</h1>
    <div class="flex items-center gap-2">
      <div class="h-2 w-2 rounded-full {connected ? 'bg-green-400' : 'bg-gray-600'}"></div>
      <span class="text-xs text-gray-500">{connected ? 'Connected' : 'Disconnected'}</span>
    </div>
  </div>

  {#if loading}
    <LoadingSpinner />
  {:else if !sessionId}
    <div class="flex flex-col items-center justify-center flex-1 text-gray-500">
      <div class="text-4xl mb-4">⚡</div>
      <p class="text-sm">No active Claude Code session detected.</p>
      <p class="text-xs mt-2 text-gray-600">Start a session in your terminal and refresh this page.</p>
    </div>
  {:else if session}
    <!-- Session info -->
    <div class="shrink-0 bg-gray-900 border border-gray-800 rounded-lg p-3 text-xs text-gray-400 flex items-center gap-4">
      <span class="font-medium text-gray-300">{session.projectName}</span>
      {#if session.gitBranch && session.gitBranch !== 'HEAD'}
        <span class="text-purple-400">{session.gitBranch}</span>
      {/if}
      <span class="ml-auto">{messages.length} messages</span>
      <a href="/sessions/{sessionId}" class="text-blue-400 hover:underline">Full view</a>
    </div>

    <!-- Messages -->
    <div
      class="flex-1 overflow-auto space-y-3"
      bind:this={messagesDiv}
      onscroll={handleScroll}
    >
      {#each messages as message (message.uuid)}
        <div class="animate-in fade-in duration-300">
          <MessageCard {message} />
        </div>
      {/each}
    </div>

    <!-- Scroll to bottom button -->
    {#if !autoScroll}
      <button
        onclick={() => { autoScroll = true; scrollToBottom(); }}
        class="fixed bottom-8 right-8 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-full text-xs text-white shadow-lg transition-colors"
      >
        ↓ Scroll to bottom
      </button>
    {/if}
  {/if}
</div>
