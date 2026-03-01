<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';
  import { get } from 'svelte/store';
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

  // Advanced settings
  let showAdvanced = $state(false);
  let effort = $state('medium');
  let thinkingMode = $state('auto');
  let thinkingBudget = $state('');
  let maxTurns = $state('');
  let maxBudgetUsd = $state('');
  let appendPrompt = $state('');
  let allowedTools = $state('');
  let disallowedTools = $state('');
  let customAgents = $state<{ name: string; description: string }[]>([]);
  let enableFileCheckpointing = $state(false);
  let mcpServers = $state<{ name: string; type: string; command?: string; args?: string[]; url?: string; env?: Record<string, string>; enabled: boolean }[]>([]);
  let showToolPanel = $state(false);

  // UI state
  let messagesContainer = $state<HTMLElement | null>(null);
  let autoScroll = $state(true);
  let showScrollBtn = $state(false);

  const state = $derived($chatState);

  // Wire up WebSocket chat events
  let cleanups: (() => void)[] = [];

  onMount(async () => {
    // Load custom agents from localStorage
    try {
      const saved = localStorage.getItem('companion:customAgents');
      if (saved) customAgents = JSON.parse(saved);
    } catch {}

    [projects, mcpServers] = await Promise.all([
      api.getProjects().catch(() => []),
      api.getMcpServers().catch(() => []),
    ]);

    // Pre-fill project path from first project
    if (projects.length > 0 && !projectPath) {
      projectPath = projects[0].path;
    }

    const ws = getWsClient();

    cleanups.push(
      ws.onChatCreated((sessionId) => {
        chatState.update((s) => ({ ...s, sessionId, status: 'active' }));
      }),
      ws.onChatEvent((eventSessionId, event) => {
        const current = get(chatState);
        // Ignore events from old sessions — only process if session matches or
        // if we're in 'creating' state (sessionId not yet assigned, init event incoming)
        if (current.sessionId && current.sessionId !== eventSessionId) return;
        if (!current.sessionId && current.status !== 'creating') return;
        handleStreamEvent(event);
      }),
      ws.onToolApproval((msg) => {
        chatState.update((s) => ({
          ...s,
          status: 'waiting_approval',
          pendingApproval: { toolId: msg.toolId, toolName: msg.toolName, input: msg.input },
        }));
      }),
      ws.onChatSessionEnd((endedSessionId, exitCode) => {
        chatState.update((s) => {
          // Only apply if this is our current session — ignore stale ends from old/forked sessions
          if (s.sessionId !== endedSessionId) return s;
          return { ...s, status: 'ended', isStreaming: false };
        });
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
      if (projectPath) createChatSession({ projectPath, model, resumeSessionId: resumeId, permissionMode });
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
    const thinkingConfig = thinkingMode === 'auto' ? undefined
      : thinkingMode === 'enabled' ? { type: 'enabled', budgetTokens: thinkingBudget ? Number(thinkingBudget) : undefined }
      : { type: 'disabled' };
    // Save custom agents to localStorage
    const validAgents = customAgents.filter(a => a.name.trim());
    if (validAgents.length > 0) {
      localStorage.setItem('companion:customAgents', JSON.stringify(validAgents));
    }

    createChatSession({
      projectPath: projectPath.trim(),
      model: model || undefined,
      permissionMode,
      effort: effort !== 'medium' ? effort : undefined,
      thinking: thinkingConfig,
      maxTurns: maxTurns ? Number(maxTurns) : undefined,
      maxBudgetUsd: maxBudgetUsd ? Number(maxBudgetUsd) : undefined,
      appendSystemPrompt: appendPrompt.trim() || undefined,
      allowedTools: allowedTools.trim() ? allowedTools.split(',').map(s => s.trim()) : undefined,
      disallowedTools: disallowedTools.trim() ? disallowedTools.split(',').map(s => s.trim()) : undefined,
      customAgents: validAgents.length > 0 ? Object.fromEntries(validAgents.map(a => [a.name, { description: a.description }])) : undefined,
      mcpServers: mcpServers.filter(s => s.enabled).length > 0
        ? Object.fromEntries(mcpServers.filter(s => s.enabled).map(s => [s.name, { type: s.type, command: s.command, args: s.args, url: s.url, env: s.env }]))
        : undefined,
      enableFileCheckpointing: enableFileCheckpointing || undefined,
    });
  }

  function handleSend(text: string) {
    sendChatMessage(text);
  }

  function handleSlashCommand(cmd: { name: string; isBuiltIn?: boolean }, args: string) {
    const ws = getWsClient();
    switch (cmd.name) {
      case 'plan':
        ws.updateSessionSettings(state.sessionId!, { permissionMode: 'plan' });
        chatState.update(s => ({ ...s, permissionMode: 'plan' }));
        break;
      case 'default':
        ws.updateSessionSettings(state.sessionId!, { permissionMode: 'default' });
        chatState.update(s => ({ ...s, permissionMode: 'default' }));
        break;
      case 'yolo':
        ws.updateSessionSettings(state.sessionId!, { permissionMode: 'bypassPermissions' });
        chatState.update(s => ({ ...s, permissionMode: 'bypassPermissions' }));
        break;
      case 'stop':
        ws.interruptSession(state.sessionId!);
        break;
      case 'clear':
        chatState.update(s => ({ ...s, messages: [] }));
        break;
      case 'new':
        endChatSession();
        resetChat();
        break;
      default:
        // Forward SDK slash commands as messages
        sendChatMessage('/' + cmd.name + (args ? ' ' + args : ''));
        break;
    }
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

          <!-- Advanced settings -->
          <div>
            <button
              type="button"
              onclick={() => showAdvanced = !showAdvanced}
              class="text-xs text-gray-500 hover:text-gray-300 cursor-pointer transition-colors"
            >
              {showAdvanced ? '▾' : '▸'} Advanced settings
            </button>
            {#if showAdvanced}
              <div class="mt-3 space-y-3">
                <div class="grid grid-cols-2 gap-3">
                  <div>
                    <label class="block text-xs text-gray-400 mb-1 font-medium">Effort</label>
                    <select bind:value={effort} class="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500">
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                  </div>
                  <div>
                    <label class="block text-xs text-gray-400 mb-1 font-medium">Thinking</label>
                    <select bind:value={thinkingMode} class="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500">
                      <option value="auto">Auto (adaptive)</option>
                      <option value="enabled">Enabled</option>
                      <option value="disabled">Disabled</option>
                    </select>
                  </div>
                </div>

                {#if thinkingMode === 'enabled'}
                  <div>
                    <label class="block text-xs text-gray-400 mb-1 font-medium">Thinking budget (tokens)</label>
                    <input type="number" bind:value={thinkingBudget} min="1" placeholder="Default" class="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500" />
                  </div>
                {/if}

                <div class="grid grid-cols-2 gap-3">
                  <div>
                    <label class="block text-xs text-gray-400 mb-1 font-medium">Max turns</label>
                    <input type="number" bind:value={maxTurns} min="1" placeholder="No limit" class="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500" />
                  </div>
                  <div>
                    <label class="block text-xs text-gray-400 mb-1 font-medium">Max budget ($)</label>
                    <input type="number" bind:value={maxBudgetUsd} min="0" step="0.01" placeholder="No limit" class="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500" />
                  </div>
                </div>

                <div class="flex items-center gap-2">
                  <input type="checkbox" bind:checked={enableFileCheckpointing} class="accent-blue-500" id="checkpoint-toggle" />
                  <label for="checkpoint-toggle" class="text-xs text-gray-400 font-medium cursor-pointer">Enable file checkpointing (undo support)</label>
                </div>

                <div>
                  <label class="block text-xs text-gray-400 mb-1 font-medium">Custom instructions</label>
                  <textarea bind:value={appendPrompt} rows="3" placeholder="Appended to system prompt..." class="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500 resize-none"></textarea>
                </div>

                <div class="grid grid-cols-2 gap-3">
                  <div>
                    <label class="block text-xs text-gray-400 mb-1 font-medium">Allowed tools</label>
                    <input type="text" bind:value={allowedTools} placeholder="e.g. Bash,Read,Write" class="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500 font-mono" />
                  </div>
                  <div>
                    <label class="block text-xs text-gray-400 mb-1 font-medium">Disallowed tools</label>
                    <input type="text" bind:value={disallowedTools} placeholder="e.g. Write,NotebookEdit" class="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500 font-mono" />
                  </div>
                </div>

                <!-- Custom agents -->
                <div>
                  <label class="block text-xs text-gray-400 mb-1 font-medium">Custom Agents</label>
                  <div class="space-y-2">
                    {#each customAgents as agent, i}
                      <div class="flex gap-2">
                        <input bind:value={agent.name} placeholder="Name" class="w-28 bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500 font-mono" />
                        <input bind:value={agent.description} placeholder="Description" class="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500" />
                        <button onclick={() => { customAgents = customAgents.filter((_, j) => j !== i); }} class="text-xs text-gray-600 hover:text-red-400 px-1">x</button>
                      </div>
                    {/each}
                    <button
                      onclick={() => { customAgents = [...customAgents, { name: '', description: '' }]; }}
                      class="text-xs text-gray-500 hover:text-blue-400 transition-colors"
                    >
                      + Add agent
                    </button>
                  </div>
                </div>

                <!-- MCP Servers -->
                <div>
                  <label class="block text-xs text-gray-400 mb-1 font-medium">MCP Servers</label>
                  <div class="space-y-2">
                    {#each mcpServers as server, i}
                      <div class="flex items-center gap-2 bg-gray-800/50 rounded px-2 py-1.5">
                        <input type="checkbox" bind:checked={server.enabled} class="accent-blue-500" />
                        <span class="text-xs font-mono text-gray-300">{server.name}</span>
                        <span class="text-[10px] text-gray-600">{server.type}</span>
                        <span class="text-[10px] text-gray-600 truncate flex-1">{server.command || server.url || ''}</span>
                        <button onclick={() => { mcpServers = mcpServers.filter((_, j) => j !== i); }} class="text-xs text-gray-600 hover:text-red-400 px-1">x</button>
                      </div>
                    {/each}
                    <div class="flex gap-2">
                      <button
                        onclick={() => { mcpServers = [...mcpServers, { name: '', type: 'stdio', command: '', args: [], enabled: true }]; }}
                        class="text-xs text-gray-500 hover:text-blue-400 transition-colors"
                      >
                        + Add stdio server
                      </button>
                      <button
                        onclick={() => { mcpServers = [...mcpServers, { name: '', type: 'sse', url: '', enabled: true }]; }}
                        class="text-xs text-gray-500 hover:text-blue-400 transition-colors"
                      >
                        + Add SSE server
                      </button>
                    </div>
                    {#each mcpServers as server, i}
                      {#if !server.name || (!server.command && !server.url)}
                        <div class="flex gap-2 pl-2 border-l-2 border-blue-700/40">
                          <input bind:value={server.name} placeholder="Name" class="w-24 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500 font-mono" />
                          {#if server.type === 'stdio'}
                            <input bind:value={server.command} placeholder="Command (e.g. npx)" class="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500 font-mono" />
                          {:else}
                            <input bind:value={server.url} placeholder="URL" class="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500 font-mono" />
                          {/if}
                        </div>
                      {/if}
                    {/each}
                    {#if mcpServers.length > 0}
                      <button
                        onclick={async () => { await api.saveMcpServers(mcpServers.filter(s => s.name)); }}
                        class="text-xs text-gray-500 hover:text-green-400 transition-colors"
                      >
                        Save MCP config
                      </button>
                    {/if}
                  </div>
                </div>
              </div>
            {/if}
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
      <div class="flex items-center gap-2 px-4 py-2.5 border-b border-gray-800 shrink-0">
        <!-- Project name + session ID -->
        <span class="text-xs text-gray-500 font-mono truncate">{state.projectPath.split('/').pop()}</span>
        {#if state.claudeSessionId || state.sessionId}
          <button
            onclick={() => navigator.clipboard.writeText(state.claudeSessionId || state.sessionId || '')}
            class="text-[10px] text-gray-600 hover:text-blue-400 transition-colors cursor-pointer font-mono"
            title="Copy session ID: {state.claudeSessionId || state.sessionId || ''}"
          >
            {(state.claudeSessionId ?? state.sessionId ?? '').slice(0, 8)}
          </button>
        {/if}

        <span class="text-gray-700">|</span>

        <!-- Model selector -->
        <select
          value={state.model}
          onchange={(e) => {
            const ws = getWsClient();
            const newModel = e.currentTarget.value;
            ws.updateSessionSettings(state.sessionId!, { model: newModel });
            chatState.update(s => ({ ...s, model: newModel }));
          }}
          class="bg-gray-800 border border-gray-700 rounded px-2 py-0.5 text-xs text-gray-300 focus:outline-none focus:border-blue-500"
        >
          <option value="claude-sonnet-4-6">Sonnet 4.6</option>
          <option value="claude-opus-4-6">Opus 4.6</option>
          <option value="claude-haiku-4-5-20251001">Haiku 4.5</option>
          <option value="claude-sonnet-4-5">Sonnet 4.5</option>
          <option value="claude-opus-4-5">Opus 4.5</option>
        </select>

        <!-- Permission mode selector -->
        <select
          value={state.permissionMode}
          onchange={(e) => {
            const ws = getWsClient();
            const newMode = e.currentTarget.value;
            ws.updateSessionSettings(state.sessionId!, { permissionMode: newMode });
            chatState.update(s => ({ ...s, permissionMode: newMode }));
          }}
          class="bg-gray-800 border border-gray-700 rounded px-2 py-0.5 text-xs text-gray-300 focus:outline-none focus:border-blue-500"
        >
          <option value="default">Default</option>
          <option value="acceptEdits">Accept edits</option>
          <option value="bypassPermissions">Bypass</option>
          <option value="plan">Plan</option>
        </select>

        <!-- Status + controls -->
        <div class="ml-auto flex items-center gap-2 shrink-0">
          <button
            onclick={() => showToolPanel = !showToolPanel}
            class="text-[10px] text-gray-600 hover:text-gray-400 transition-colors"
            title="Toggle tools panel"
          >
            Tools
          </button>
          {#if state.isStreaming}
            <button
              onclick={() => getWsClient().interruptSession(state.sessionId!)}
              class="px-2 py-0.5 text-xs text-red-400 hover:text-red-300 border border-red-700/40 rounded hover:bg-red-900/20 transition-colors"
            >
              Stop
            </button>
          {/if}
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
              Approval
            </span>
          {:else if state.status === 'ended'}
            <span class="text-xs text-gray-500">Ended</span>
          {/if}
          {#if state.status === 'ended'}
            <button
              onclick={resetChat}
              class="px-3 py-1 bg-blue-600 hover:bg-blue-500 rounded text-xs text-white font-medium transition-colors"
            >
              + New
            </button>
          {:else}
            <button
              onclick={() => {
                const resumeId = state.claudeSessionId;
                const path = state.projectPath;
                const mdl = state.model;
                const perm = state.permissionMode;
                console.log('[Fork] claudeSessionId:', resumeId, 'sessionId:', state.sessionId, 'path:', path);
                if (!path) {
                  chatState.update(s => ({ ...s, error: 'Cannot fork: no project path' }));
                  return;
                }
                if (!resumeId) {
                  chatState.update(s => ({ ...s, error: 'Cannot fork: no Claude session ID (init event may not have fired)' }));
                  return;
                }
                // End the current session first, then resume from it
                endChatSession();
                // Small delay to let the backend clean up the old session
                setTimeout(() => {
                  createChatSession({
                    projectPath: path,
                    model: mdl,
                    resumeSessionId: resumeId,
                    permissionMode: perm,
                  });
                }, 500);
              }}
              class="text-xs text-gray-600 hover:text-blue-400 transition-colors"
              title="Fork session (end current, resume from same point)"
            >
              Fork
            </button>
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

      <!-- Tool discovery panel (from system init) -->
      {#if showToolPanel}
        <div class="border-b border-gray-800 px-4 py-2 max-h-40 overflow-auto shrink-0 bg-gray-900/50">
          <div class="flex items-center justify-between mb-1">
            <span class="text-xs text-gray-500 font-medium">Available tools</span>
            <button onclick={() => showToolPanel = false} class="text-[10px] text-gray-600 hover:text-gray-400">close</button>
          </div>
          <div class="flex flex-wrap gap-1">
            {#each (state.availableCommands ?? []) as cmd}
              <span class="px-1.5 py-0.5 bg-gray-800 rounded text-[10px] text-blue-400 font-mono">/{cmd.name}</span>
            {/each}
            {#each (state.availableAgents ?? []) as agent}
              <span class="px-1.5 py-0.5 bg-gray-800 rounded text-[10px] text-purple-400 font-mono">@{agent.name}</span>
            {/each}
          </div>
        </div>
      {/if}

      <!-- Messages -->
      <div
        bind:this={messagesContainer}
        onscroll={handleScroll}
        class="flex-1 overflow-auto p-4 space-y-4"
      >
        {#each state.messages as msg, msgIdx}
          <!-- Replay divider: show after last replay message -->
          {#if msg.isReplay && (msgIdx === state.messages.length - 1 || !state.messages[msgIdx + 1]?.isReplay)}
            <!-- rendered after this message below -->
          {/if}

          <div class={msg.isReplay ? 'opacity-50' : ''}>
          {#if msg.role === 'user'}
            <div class="flex justify-end group">
              <div class="max-w-[80%] bg-blue-600/20 border border-blue-600/30 rounded-2xl rounded-tr-md px-4 py-2.5 text-sm text-gray-200 relative">
                {msg.text}
                {#if msg.isReplay}
                  <span class="text-[10px] text-gray-600 ml-2">from previous session</span>
                {/if}
                {#if enableFileCheckpointing && msg.uuid && !msg.isReplay}
                  <button
                    onclick={() => getWsClient().rewindSession(state.sessionId!, msg.uuid!, false)}
                    class="absolute -left-16 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 px-1.5 py-0.5 bg-gray-700/80 border border-gray-600 rounded text-[10px] text-gray-400 hover:text-orange-300 hover:border-orange-600/40 transition-all whitespace-nowrap"
                  >
                    Undo
                  </button>
                {/if}
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
                {#if tc.name === 'Agent'}
                  <!-- Agent invocation with special styling -->
                  <details class="border border-purple-700/40 rounded-lg overflow-hidden" open>
                    <summary class="flex items-center gap-2 px-3 py-2 bg-purple-900/20 cursor-pointer">
                      <span class="text-xs font-mono text-purple-400">Agent: {tc.input?.subagent_type || 'general'}</span>
                      <span class="text-xs text-gray-500 truncate">{tc.input?.description || ''}</span>
                      <span class="text-xs ml-auto {tc.result ? 'text-green-500' : 'text-yellow-400'}">
                        {tc.result ? 'done' : 'running...'}
                      </span>
                    </summary>
                    {#if tc.result}
                      <div class="px-3 py-2 text-xs text-gray-500 max-h-32 overflow-auto whitespace-pre-wrap">
                        {tc.result.slice(0, 500)}{tc.result.length > 500 ? '...' : ''}
                      </div>
                    {/if}
                  </details>
                {:else}
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
                {/if}
              {/each}
              <!-- Cost -->
              {#if msg.cost}
                <div class="text-right text-xs text-gray-700">${msg.cost.toFixed(4)}</div>
              {/if}
            </div>
          {/if}
          </div>

          <!-- Replay divider after last replay message -->
          {#if msg.isReplay && (msgIdx === state.messages.length - 1 || !state.messages[msgIdx + 1]?.isReplay)}
            <div class="flex items-center gap-2 py-2 text-xs text-gray-600">
              <div class="flex-1 h-px bg-gray-800"></div>
              <span>Resumed session</span>
              <div class="flex-1 h-px bg-gray-800"></div>
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
        onSlashCommand={handleSlashCommand}
        availableCommands={state.availableCommands}
        availableAgents={state.availableAgents}
      />
    </div>
  {/if}
</div>
