<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';
  import { page } from '$app/stores';
  import { api } from '$lib/api/client.js';
  import { getWsClient } from '$lib/api/websocket.js';
  import {
    chatState,
    handleStreamEvent,
    createChatSession,
    sendChatMessage,
    approveToolUse,
    endChatSession,
    resetChat,
  } from '$lib/stores/chat.js';
  import type { ProjectInfo } from '$shared/types.js';
  import ChatInput from '$lib/components/chat/ChatInput.svelte';
  import ToolApproval from '$lib/components/chat/ToolApproval.svelte';
  import StreamingMessage from '$lib/components/chat/StreamingMessage.svelte';
  import MarkdownRenderer from '$lib/components/shared/MarkdownRenderer.svelte';

  // Setup form state
  let projects = $state<ProjectInfo[]>([]);
  let projectPath = $state('');
  let model = $state('claude-sonnet-4-6');
  let permissionMode = $state('default');

  // UI state
  let messagesContainer = $state<HTMLElement | null>(null);
  let autoScroll = $state(true);
  let showScrollBtn = $state(false);

  const state = $derived($chatState);

  // Wire up WebSocket chat events
  let cleanups: (() => void)[] = [];

  onMount(async () => {
    projects = await api.getProjects().catch(() => []);

    // Pre-fill project path from first project
    if (projects.length > 0 && !projectPath) {
      projectPath = projects[0].path;
    }

    const ws = getWsClient();

    cleanups.push(
      ws.onChatCreated((sessionId) => {
        chatState.update((s) => ({ ...s, sessionId, status: 'active' }));
      }),
      ws.onChatEvent((_sessionId, event) => {
        handleStreamEvent(event);
      }),
      ws.onToolApproval((msg) => {
        chatState.update((s) => ({
          ...s,
          status: 'waiting_approval',
          pendingApproval: { toolId: msg.toolId, toolName: msg.toolName, input: msg.input },
        }));
      }),
      ws.onChatSessionEnd((_sessionId, exitCode) => {
        chatState.update((s) => ({ ...s, status: 'ended', isStreaming: false }));
      }),
      ws.onError((message) => {
        chatState.update((s) => ({
          ...s,
          status: s.status === 'creating' ? 'idle' : s.status,
          error: message,
        }));
      }),
    );

    // Check for ?resume= param (optionally with ?project= to set correct cwd)
    const resumeId = $page.url.searchParams.get('resume');
    const projectParam = $page.url.searchParams.get('project');
    if (resumeId) {
      if (projectParam) projectPath = projectParam;
      if (projectPath) createChatSession(projectPath, model, resumeId, permissionMode);
    }
  });

  onDestroy(() => {
    for (const cleanup of cleanups) cleanup();
  });

  // Auto-scroll
  $effect(() => {
    const msgs = state.messages;
    const streaming = state.isStreaming;
    if (autoScroll && messagesContainer) {
      tick().then(() => {
        messagesContainer!.scrollTop = messagesContainer!.scrollHeight;
      });
    }
  });

  function handleScroll() {
    if (!messagesContainer) return;
    const { scrollTop, scrollHeight, clientHeight } = messagesContainer;
    const atBottom = scrollHeight - scrollTop - clientHeight < 60;
    autoScroll = atBottom;
    showScrollBtn = !atBottom;
  }

  function scrollToBottom() {
    if (!messagesContainer) return;
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    autoScroll = true;
    showScrollBtn = false;
  }

  function startSession() {
    if (!projectPath.trim()) return;
    createChatSession(projectPath.trim(), model || undefined, undefined, permissionMode);
  }

  function handleSend(text: string) {
    sendChatMessage(text);
  }
</script>

<div class="h-full flex flex-col">
  {#if state.status === 'idle' || state.status === 'creating'}
    <!-- ── Session creation form ── -->
    <div class="flex-1 flex items-center justify-center p-8">
      <div class="w-full max-w-md space-y-6">
        <div>
          <h1 class="text-2xl font-bold text-white">Start Claude Session</h1>
          <p class="text-sm text-gray-500 mt-1">Interactive chat with Claude Code via Agent SDK</p>
        </div>

        <div class="space-y-4">
          <div>
            <label class="block text-xs text-gray-400 mb-1.5 font-medium">Project path</label>
            {#if projects.length > 0}
              <select
                bind:value={projectPath}
                class="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-gray-200 focus:outline-none focus:border-blue-500 mb-2"
              >
                {#each projects as p}
                  <option value={p.path}>{p.name}</option>
                {/each}
              </select>
            {/if}
            <input
              type="text"
              bind:value={projectPath}
              placeholder="/Users/you/project"
              class="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500 font-mono"
            />
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs text-gray-400 mb-1.5 font-medium">Model</label>
              <select
                bind:value={model}
                class="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-gray-200 focus:outline-none focus:border-blue-500"
              >
                <option value="claude-sonnet-4-6">Sonnet 4.6</option>
                <option value="claude-opus-4-6">Opus 4.6</option>
                <option value="claude-haiku-4-5-20251001">Haiku 4.5</option>
                <option value="claude-sonnet-4-5">Sonnet 4.5</option>
                <option value="claude-opus-4-5">Opus 4.5</option>
              </select>
            </div>
            <div>
              <label class="block text-xs text-gray-400 mb-1.5 font-medium">Permissions</label>
              <select
                bind:value={permissionMode}
                class="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-gray-200 focus:outline-none focus:border-blue-500"
              >
                <option value="default">Default (approve via UI)</option>
                <option value="acceptEdits">Accept edits</option>
                <option value="bypassPermissions">Bypass all permissions</option>
                <option value="plan">Plan only (read-only)</option>
              </select>
            </div>
          </div>

          <button
            onclick={startSession}
            disabled={!projectPath.trim() || state.status === 'creating'}
            class="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
          >
            {state.status === 'creating' ? 'Starting...' : 'Start Session'}
          </button>
        </div>
      </div>
    </div>

  {:else}
    <!-- ── Active chat view ── -->
    <div class="flex-1 flex flex-col overflow-hidden">
      <!-- Chat header -->
      <div class="flex items-center gap-3 px-4 py-2.5 border-b border-gray-800 shrink-0">
        <div class="flex-1 min-w-0 flex items-center gap-2">
          <span class="text-xs text-gray-500 font-mono truncate">{state.projectPath.split('/').pop()}</span>
          {#if state.claudeSessionId || state.sessionId}
            <span class="text-xs text-gray-400 font-mono">| {(state.claudeSessionId ?? state.sessionId ?? '').slice(0, 8)}...</span>
            <button
              onclick={() => {
                navigator.clipboard.writeText(state.claudeSessionId || state.sessionId || '');
              }}
              class="text-xs text-gray-400 hover:text-blue-400 transition-colors cursor-pointer"
              title="Copy full session ID: {state.claudeSessionId || state.sessionId || ''}"
            >
              Copy
            </button>
          {/if}
        </div>
        <div class="flex items-center gap-2 shrink-0">
          {#if state.status === 'active' && !state.isStreaming}
            <span class="flex items-center gap-1 text-xs text-green-500">
              <span class="w-1.5 h-1.5 rounded-full bg-green-500"></span>
              Ready
            </span>
          {:else if state.isStreaming}
            <span class="flex items-center gap-1 text-xs text-blue-400">
              <span class="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse"></span>
              Responding
            </span>
          {:else if state.status === 'waiting_approval'}
            <span class="flex items-center gap-1 text-xs text-yellow-400">
              <span class="w-1.5 h-1.5 rounded-full bg-yellow-400"></span>
              Waiting for approval
            </span>
          {:else if state.status === 'ended'}
            <span class="text-xs text-gray-500">Session ended</span>
          {/if}
          {#if state.status === 'ended'}
            <button
              onclick={resetChat}
              class="px-3 py-1 bg-blue-600 hover:bg-blue-500 rounded text-xs text-white font-medium transition-colors"
            >
              + New Session
            </button>
          {:else}
            <button
              onclick={endChatSession}
              class="text-xs text-gray-600 hover:text-red-400 transition-colors"
              title="End session"
            >
              End
            </button>
          {/if}
        </div>
      </div>

      <!-- Messages -->
      <div
        bind:this={messagesContainer}
        onscroll={handleScroll}
        class="flex-1 overflow-auto p-4 space-y-4"
      >
        {#each state.messages as msg}
          {#if msg.role === 'user'}
            <div class="flex justify-end">
              <div class="max-w-[80%] bg-blue-600/20 border border-blue-600/30 rounded-2xl rounded-tr-md px-4 py-2.5 text-sm text-gray-200">
                {msg.text}
              </div>
            </div>
          {:else}
            <div class="space-y-2">
              <!-- Thinking -->
              {#if msg.thinking}
                <details class="border border-gray-800 rounded-lg overflow-hidden">
                  <summary class="px-3 py-2 bg-gray-800/50 text-xs text-gray-500 cursor-pointer hover:text-gray-300">
                    Thinking ({msg.thinking.length} chars)
                  </summary>
                  <div class="px-3 py-2 text-xs text-gray-500 font-mono whitespace-pre-wrap leading-relaxed max-h-48 overflow-auto">
                    {msg.thinking}
                  </div>
                </details>
              {/if}
              <!-- Text -->
              {#if msg.text}
                <div class="text-sm text-gray-200 leading-relaxed">
                  <MarkdownRenderer content={msg.text} />
                </div>
              {/if}
              <!-- Tool calls -->
              {#each (msg.toolCalls ?? []) as tc}
                <div class="border border-gray-700/60 rounded-lg overflow-hidden">
                  <div class="flex items-center gap-2 px-3 py-2 bg-gray-800/40">
                    <span class="text-xs font-mono text-blue-400">{tc.name}</span>
                    {#if tc.result !== undefined}
                      <span class="text-xs {tc.isError ? 'text-red-400' : 'text-green-500'} ml-auto">
                        {tc.isError ? 'error' : 'done'}
                      </span>
                    {/if}
                  </div>
                  {#if tc.result}
                    <div class="px-3 py-2 text-xs font-mono text-gray-500 max-h-24 overflow-auto whitespace-pre-wrap">
                      {tc.result.slice(0, 500)}{tc.result.length > 500 ? '...' : ''}
                    </div>
                  {/if}
                </div>
              {/each}
              <!-- Cost -->
              {#if msg.cost}
                <div class="text-right text-xs text-gray-700">${msg.cost.toFixed(4)}</div>
              {/if}
            </div>
          {/if}
        {/each}

        <!-- Streaming message -->
        {#if state.isStreaming}
          <StreamingMessage streaming={state.streaming} />
        {/if}

        <!-- Tool approval -->
        {#if state.pendingApproval}
          <ToolApproval
            toolName={state.pendingApproval.toolName}
            toolId={state.pendingApproval.toolId}
            input={state.pendingApproval.input}
            onApprove={approveToolUse}
          />
        {/if}

        <!-- Session ended -->
        {#if state.status === 'ended'}
          <div class="text-center py-6">
            <p class="text-xs text-gray-600">Session ended -- click <strong class="text-gray-400">+ New Session</strong> in the header to start a fresh chat</p>
          </div>
        {/if}

        <!-- Error -->
        {#if state.error}
          <div class="text-sm text-red-400 bg-red-900/20 border border-red-700/50 rounded-lg px-3 py-2">
            {state.error}
          </div>
        {/if}
      </div>

      <!-- Scroll to bottom button -->
      {#if showScrollBtn}
        <div class="absolute bottom-20 right-4">
          <button
            onclick={scrollToBottom}
            class="flex items-center gap-1 px-3 py-1.5 bg-gray-700 border border-gray-600 rounded-full text-xs text-gray-300 shadow-lg hover:bg-gray-600"
          >
            Scroll to bottom
          </button>
        </div>
      {/if}

      <!-- Input -->
      <ChatInput
        disabled={state.status !== 'active' || state.isStreaming || !!state.pendingApproval}
        onSend={handleSend}
      />
    </div>
  {/if}
</div>
