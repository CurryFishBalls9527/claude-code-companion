<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { page } from '$app/stores';
  import { api } from '$lib/api/client.js';
  import { getWsClient } from '$lib/api/websocket.js';
  import TerminalPanel from '$lib/components/chat/TerminalPanel.svelte';
  import type { ProjectInfo, SubagentInfo } from '$shared/types.js';

  interface SubagentEntry extends SubagentInfo {
    ptySessionId: string;
  }

  interface PtyTab {
    localId: string;
    ptyId: string;
    label: string;
    status: 'idle' | 'creating' | 'active' | 'ended';
    exitCode: number | null;
    projectPath: string;
    model: string;
    permissionMode: string;
    resumeSessionId: string;
    bookmarked: boolean;
    tags: string[];
    notes: string;
    // Virtual tab fields (for background agent output viewing)
    virtual?: boolean;
    virtualToolUseId?: string;
    virtualContent?: string;
  }

  // Template config (used for new sessions)
  let projects = $state<ProjectInfo[]>([]);
  let projectPath = $state('');
  let model = $state('claude-sonnet-4-6');
  let permissionMode = $state('default');
  let resumeSessionId = $state('');

  // Multi-session state
  let sessions = $state<PtyTab[]>([]);
  let activeTabId = $state('');
  let splitTabId = $state<string | null>(null);
  let splitMode = $state(false);
  let pendingCreateIds = $state<string[]>([]);
  let terminalRefs: Record<string, TerminalPanel> = {};

  let activeSession = $derived(sessions.find(s => s.localId === activeTabId));
  let splitSession = $derived(splitTabId ? sessions.find(s => s.localId === splitTabId) : null);

  // Subagent tracking
  let subagents = $state<SubagentEntry[]>([]);
  let subagentsOpen = $state(true);
  let activeSessionSubagents = $derived(
    activeSession?.ptyId
      ? subagents.filter(s => s.ptySessionId === activeSession!.ptyId)
      : []
  );

  // Sidebar
  let sidebarOpen = $state(true);
  let configOpen = $state(true);

  // Tab rename
  let renamingTabId = $state<string | null>(null);
  let renameValue = $state('');

  function startRename(localId: string) {
    const session = sessions.find(s => s.localId === localId);
    if (!session) return;
    renamingTabId = localId;
    renameValue = session.label;
  }

  function commitRename() {
    if (renamingTabId) {
      const session = sessions.find(s => s.localId === renamingTabId);
      if (session && renameValue.trim()) {
        session.label = renameValue.trim();
        sessions = sessions;
      }
      renamingTabId = null;
    }
  }

  // Tag input
  let tagInput = $state('');
  let notesSaveTimer: ReturnType<typeof setTimeout> | null = null;

  let cleanups: (() => void)[] = [];

  function genId(): string {
    return crypto.randomUUID();
  }

  function labelFromPath(path: string): string {
    const parts = path.replace(/\/+$/, '').split('/');
    return parts[parts.length - 1] || 'session';
  }

  // ── Session lifecycle ──

  function addSession(): string {
    const localId = genId();
    const tab: PtyTab = {
      localId,
      ptyId: '',
      label: labelFromPath(projectPath || 'session'),
      status: 'idle',
      exitCode: null,
      projectPath,
      model,
      permissionMode,
      resumeSessionId,
      bookmarked: false,
      tags: [],
      notes: '',
    };
    sessions = [...sessions, tab];
    activeTabId = localId;
    configOpen = true;
    return localId;
  }

  function startSession(localId?: string) {
    const id = localId ?? activeTabId;
    const session = sessions.find(s => s.localId === id);
    if (!session || !session.projectPath.trim()) return;

    session.status = 'creating';
    session.exitCode = null;
    session.label = labelFromPath(session.projectPath);
    sessions = sessions;
    configOpen = false;

    pendingCreateIds = [...pendingCreateIds, id];

    const ws = getWsClient();
    const ref = terminalRefs[id];
    const cols = ref?.getCols() ?? 80;
    const rows = ref?.getRows() ?? 24;

    ws.createPtySession({
      projectPath: session.projectPath.trim(),
      model: session.model || undefined,
      permissionMode: session.permissionMode,
      resumeSessionId: session.resumeSessionId.trim() || undefined,
      cols,
      rows,
    });
  }

  function endSession(localId?: string) {
    const id = localId ?? activeTabId;
    const session = sessions.find(s => s.localId === id);
    if (!session?.ptyId) return;
    const ws = getWsClient();
    ws.endPtySession(session.ptyId);
  }

  function closeTab(localId: string) {
    const session = sessions.find(s => s.localId === localId);
    if (session && !session.virtual && (session.status === 'active' || session.status === 'creating')) {
      if (session.ptyId) {
        const ws = getWsClient();
        ws.endPtySession(session.ptyId);
      }
    }

    // Clean up terminal ref and subagents (only for real sessions)
    delete terminalRefs[localId];
    if (session?.ptyId && !session.virtual) {
      subagents = subagents.filter(s => s.ptySessionId !== session.ptyId);
    }

    sessions = sessions.filter(s => s.localId !== localId);

    // Fix active tab
    if (activeTabId === localId) {
      activeTabId = sessions.length > 0 ? sessions[sessions.length - 1].localId : '';
    }

    // Fix split
    if (splitTabId === localId) {
      splitTabId = null;
    }
    if (sessions.length < 2) {
      splitMode = false;
      splitTabId = null;
    }
  }

  function makeTermDataHandler(localId: string) {
    return (data: string) => {
      const session = sessions.find(s => s.localId === localId);
      if (!session?.ptyId || session.status !== 'active') return;
      const ws = getWsClient();
      ws.sendPtyInput(session.ptyId, data);
    };
  }

  function makeTermResizeHandler(localId: string) {
    return (cols: number, rows: number) => {
      const session = sessions.find(s => s.localId === localId);
      if (!session?.ptyId || session.status !== 'active') return;
      const ws = getWsClient();
      ws.resizePty(session.ptyId, cols, rows);
    };
  }

  // ── Split view ──

  function toggleSplit() {
    const candidates = sessions.filter(s => s.localId !== activeTabId);
    if (candidates.length < 1) return;
    splitMode = !splitMode;
    if (splitMode) {
      splitTabId = candidates[0].localId;
    } else {
      splitTabId = null;
    }
  }

  function selectSplitTab(localId: string) {
    splitTabId = localId;
  }

  // ── Session meta helpers ──

  function toggleBookmark() {
    if (!activeSession) return;
    activeSession.bookmarked = !activeSession.bookmarked;
    sessions = sessions;
    if (activeSession.ptyId) {
      api.updateSessionMeta(activeSession.ptyId, { bookmarked: activeSession.bookmarked }).catch(() => {});
    }
  }

  function addTag() {
    if (!activeSession) return;
    const t = tagInput.trim();
    if (!t || activeSession.tags.includes(t)) { tagInput = ''; return; }
    activeSession.tags = [...activeSession.tags, t];
    tagInput = '';
    sessions = sessions;
    if (activeSession.ptyId) {
      api.updateSessionMeta(activeSession.ptyId, { tags: activeSession.tags }).catch(() => {});
    }
  }

  function removeTag(tag: string) {
    if (!activeSession) return;
    activeSession.tags = activeSession.tags.filter(t => t !== tag);
    sessions = sessions;
    if (activeSession.ptyId) {
      api.updateSessionMeta(activeSession.ptyId, { tags: activeSession.tags }).catch(() => {});
    }
  }

  function handleNotesInput() {
    if (notesSaveTimer) clearTimeout(notesSaveTimer);
    notesSaveTimer = setTimeout(() => {
      if (activeSession?.ptyId) {
        api.updateSessionMeta(activeSession.ptyId, { notes: activeSession.notes }).catch(() => {});
      }
    }, 1000);
  }

  // ── Virtual tabs for background agent output ──

  function viewSubagentOutput(sa: SubagentEntry) {
    // Check if a virtual tab already exists for this agent
    const existing = sessions.find(s => s.virtual && s.virtualToolUseId === sa.toolUseId);
    if (existing) {
      splitMode = true;
      splitTabId = existing.localId;
      return;
    }

    const localId = genId();
    const tab: PtyTab = {
      localId,
      ptyId: sa.ptySessionId,
      label: `Agent: ${sa.description.slice(0, 20)}`,
      status: sa.status === 'running' ? 'active' : 'ended',
      exitCode: null,
      projectPath: '',
      model: '',
      permissionMode: '',
      resumeSessionId: '',
      bookmarked: false,
      tags: [],
      notes: '',
      virtual: true,
      virtualToolUseId: sa.toolUseId,
      virtualContent: sa.resultSummary || '',
    };
    sessions = [...sessions, tab];
    // Open in split pane (right side), don't change active tab
    splitMode = true;
    splitTabId = localId;
  }

  function closeVirtualTab(localId: string) {
    sessions = sessions.filter(s => s.localId !== localId);
    if (splitTabId === localId) {
      // Switch to another right-pane tab or close split
      const remaining = sessions.filter(s => s.localId !== activeTabId);
      if (remaining.length > 0) {
        splitTabId = remaining[0].localId;
      } else {
        splitMode = false;
        splitTabId = null;
      }
    }
  }

  // ── Auto-scroll action for virtual tab output ──
  function autoScroll(node: HTMLElement, _content: string | undefined) {
    function scroll() {
      // Only auto-scroll if user is near the bottom
      const threshold = 100;
      const isNearBottom = node.scrollHeight - node.scrollTop - node.clientHeight < threshold;
      if (isNearBottom) {
        node.scrollTop = node.scrollHeight;
      }
    }
    scroll();
    return {
      update() { requestAnimationFrame(scroll); },
    };
  }

  // ── Status dot color ──

  function statusDotClass(status: PtyTab['status']): string {
    switch (status) {
      case 'active': return 'bg-green-400';
      case 'creating': return 'bg-blue-400 animate-pulse';
      case 'ended': return 'bg-red-400';
      default: return 'bg-gray-500';
    }
  }

  onMount(async () => {
    projects = await api.getProjects().catch(() => []);
    if (projects.length > 0 && !projectPath) {
      projectPath = projects[0].path;
    }

    const resumeParam = $page.url.searchParams.get('resume');
    const projectParam = $page.url.searchParams.get('project');
    if (resumeParam) resumeSessionId = resumeParam;
    if (projectParam) projectPath = projectParam;

    const ws = getWsClient();

    cleanups.push(
      ws.onPtyCreated((ptyId) => {
        const localId = pendingCreateIds[0];
        pendingCreateIds = pendingCreateIds.slice(1);
        const session = sessions.find(s => s.localId === localId);
        if (session) {
          session.ptyId = ptyId;
          session.status = 'active';
          sessions = sessions;
        }
        setTimeout(() => terminalRefs[localId ?? '']?.focus(), 100);
      }),
      ws.onPtyOutput((ptyId, data) => {
        const session = sessions.find(s => s.ptyId === ptyId);
        if (session) terminalRefs[session.localId]?.write(data);
      }),
      ws.onPtyEnded((ptyId, code) => {
        const session = sessions.find(s => s.ptyId === ptyId);
        if (session) {
          session.status = 'ended';
          session.exitCode = code;
          sessions = sessions;
        }
        // Mark any running subagents as failed
        let changed = false;
        for (const sa of subagents) {
          if (sa.ptySessionId === ptyId && sa.status === 'running') {
            sa.status = 'failed';
            changed = true;
          }
        }
        if (changed) subagents = subagents;
      }),
      ws.onSubagentStarted((ptyId, agent) => {
        if (sessions.some(s => s.ptyId === ptyId)) {
          subagents = [...subagents, { ...agent, ptySessionId: ptyId }];
        }
      }),
      ws.onSubagentCompleted((ptyId, toolUseId, summary) => {
        const sa = subagents.find(a => a.toolUseId === toolUseId && a.ptySessionId === ptyId);
        if (sa) {
          sa.status = 'completed';
          sa.resultSummary = summary;
          subagents = subagents;
        }
        // Update virtual tab status
        const vtab = sessions.find(s => s.virtual && s.virtualToolUseId === toolUseId);
        if (vtab) {
          vtab.status = 'ended';
          sessions = sessions;
        }
      }),
      ws.onSubagentOutput((ptyId, toolUseId, data) => {
        // Append to virtual tab content if one exists
        const vtab = sessions.find(s => s.virtual && s.virtualToolUseId === toolUseId);
        if (vtab) {
          vtab.virtualContent = (vtab.virtualContent || '') + data;
          sessions = sessions;
        }
        // Also accumulate in the subagent entry for later viewing
        const sa = subagents.find(a => a.toolUseId === toolUseId && a.ptySessionId === ptyId);
        if (sa) {
          sa.resultSummary = (sa.resultSummary || '') + data;
          subagents = subagents;
        }
      }),
      ws.onError((message) => {
        // If creating, revert the pending session
        const pendingId = pendingCreateIds[0];
        if (pendingId) {
          const session = sessions.find(s => s.localId === pendingId);
          if (session && session.status === 'creating') {
            session.status = 'idle';
            sessions = sessions;
          }
          pendingCreateIds = pendingCreateIds.slice(1);
        }
        console.error('[PTY] Error:', message);
      }),
    );

    // Auto-start if resume param present
    if (resumeParam && projectPath) {
      const localId = addSession();
      const session = sessions.find(s => s.localId === localId);
      if (session) {
        session.resumeSessionId = resumeParam;
        session.projectPath = projectPath;
        sessions = sessions;
      }
      startSession(localId);
    }
  });

  onDestroy(() => {
    for (const cleanup of cleanups) cleanup();
    if (notesSaveTimer) clearTimeout(notesSaveTimer);
  });

  // Collapse config when a session becomes active
  $effect(() => {
    if (activeSession && activeSession.status === 'active') {
      configOpen = false;
    }
  });

  // Expand config when no sessions
  $effect(() => {
    if (sessions.length === 0) {
      configOpen = true;
    }
  });

  // Right-pane tabs: all sessions except the active (left) one
  let rightPaneTabs = $derived(sessions.filter(s => s.localId !== activeTabId));
</script>

<div class="h-full flex">
  <!-- Terminal area -->
  <div class="flex-1 flex flex-col min-w-0">
    <!-- Tab bar -->
    <div class="shrink-0 flex items-center bg-gray-900 border-b border-gray-800 px-1 h-9 gap-0.5">
      {#each sessions.filter(s => !s.virtual) as session (session.localId)}
        <button
          onclick={() => { activeTabId = session.localId; }}
          ondblclick={(e) => { e.preventDefault(); startRename(session.localId); }}
          class="group flex items-center gap-1.5 px-2.5 py-1 rounded-t text-xs max-w-[180px] transition-colors {activeTabId === session.localId ? 'bg-blue-600/20 text-blue-300' : 'text-gray-500 hover:bg-gray-800 hover:text-gray-300'}"
        >
          <span class="w-2 h-2 rounded-full shrink-0 {statusDotClass(session.status)}"></span>
          {#if renamingTabId === session.localId}
            <!-- svelte-ignore node_invalid_placement -->
            <input
              type="text"
              bind:value={renameValue}
              onclick={(e) => e.stopPropagation()}
              onblur={commitRename}
              onkeydown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') { renamingTabId = null; } }}
              class="w-20 bg-gray-800 border border-blue-500 rounded px-1 py-0 text-xs text-gray-200 focus:outline-none"
              autofocus
            />
          {:else}
            <span class="truncate">{session.label}</span>
          {/if}
          <!-- svelte-ignore node_invalid_placement -->
          <span
            role="button"
            tabindex="-1"
            onclick={(e) => { e.stopPropagation(); closeTab(session.localId); }}
            onkeydown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); closeTab(session.localId); } }}
            class="ml-0.5 text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
          >×</span>
        </button>
      {/each}

      <!-- Add tab -->
      <button
        onclick={() => addSession()}
        class="px-2 py-1 text-gray-600 hover:text-blue-400 text-sm transition-colors"
        title="New session tab"
      >+</button>

      <div class="flex-1"></div>

      <!-- Split toggle -->
      <button
        onclick={toggleSplit}
        disabled={sessions.filter(s => s.localId !== activeTabId).length < 1}
        class="px-2 py-1 text-sm transition-colors disabled:opacity-30 disabled:cursor-not-allowed {splitMode ? 'text-blue-400' : 'text-gray-600 hover:text-gray-300'}"
        title={splitMode ? 'Disable split view' : 'Split view'}
      >⫼</button>
    </div>

    <!-- Terminal panes -->
    <div class="flex-1 min-h-0 relative">
      {#each sessions as session (session.localId)}
        {@const isLeft = session.localId === activeTabId}
        {@const isRight = splitMode && session.localId === splitTabId}
        {@const isVisible = isLeft || isRight}

        <div
          class="absolute top-0 bottom-0"
          style={
            !isVisible ? 'display:none' :
            !splitMode ? 'left:0;right:0' :
            isLeft ? 'left:0;width:50%' :
            'left:calc(50% + 141px);right:0'
          }
        >
          {#if session.virtual}
            <!-- Virtual tab: read-only agent output viewer -->
            {@const vtContent = session.virtualContent}
            <div class="h-full flex flex-col bg-[#0d1117]">
              <div class="shrink-0 px-3 py-1.5 border-b border-gray-800 flex items-center gap-2">
                <span class="w-2 h-2 rounded-full {session.status === 'active' ? 'bg-green-400 animate-pulse' : 'bg-gray-500'}"></span>
                <span class="text-xs text-gray-400">{session.label}</span>
                {#if session.status === 'ended'}
                  <span class="text-[10px] text-gray-600">completed</span>
                {/if}
              </div>
              <div
                class="flex-1 overflow-auto p-3"
                use:autoScroll={vtContent}
              >
                <pre class="text-xs text-gray-300 font-mono whitespace-pre-wrap break-words leading-relaxed">{vtContent || '(waiting for output...)'}</pre>
              </div>
            </div>
          {:else if session.status === 'idle' || session.status === 'creating'}
            <!-- Placeholder for idle/creating -->
            <div class="h-full flex items-center justify-center bg-[#0d1117]">
              <div class="text-center space-y-3">
                <div class="text-gray-500 text-sm">
                  {session.status === 'creating' ? '' : 'Configure & start this session'}
                </div>
                {#if session.status === 'creating'}
                  <div class="flex items-center justify-center gap-2 text-sm text-blue-400">
                    <span class="w-2 h-2 rounded-full bg-blue-400 animate-pulse"></span>
                    Starting...
                  </div>
                {/if}
              </div>
            </div>
          {:else}
            <!-- Terminal -->
            <div class="h-full">
              <TerminalPanel
                bind:this={terminalRefs[session.localId]}
                visible={isVisible}
                onData={makeTermDataHandler(session.localId)}
                onResize={makeTermResizeHandler(session.localId)}
              />
            </div>
          {/if}
        </div>
      {/each}

      <!-- Split divider -->
      {#if splitMode && splitTabId}
        <div class="absolute top-0 bottom-0 left-1/2 w-px bg-gray-700 z-10"></div>

        <!-- Right pane vertical tab strip -->
        <div class="absolute top-0 bottom-0 z-20 flex flex-col bg-gray-900 border-l border-r border-gray-700 overflow-y-auto" style="left:50%; width:140px">
          {#each rightPaneTabs as tab (tab.localId)}
            <button
              onclick={() => selectSplitTab(tab.localId)}
              class="group flex items-center gap-2 px-2 py-2 text-left transition-colors border-b border-gray-800 {tab.localId === splitTabId ? 'bg-blue-600/20' : 'hover:bg-gray-800'}"
              title={tab.label}
            >
              {#if tab.virtual}
                <span class="text-[10px] shrink-0 {tab.status === 'active' ? 'text-green-400' : 'text-gray-500'}">&#9658;</span>
              {:else}
                <span class="w-2 h-2 rounded-full shrink-0 {statusDotClass(tab.status)}"></span>
              {/if}
              <span
                class="text-[11px] truncate flex-1 {tab.localId === splitTabId ? 'text-blue-300' : 'text-gray-400'}"
              >{tab.label}</span>
              {#if tab.virtual}
                <!-- svelte-ignore node_invalid_placement -->
                <span
                  role="button"
                  tabindex="-1"
                  onclick={(e) => { e.stopPropagation(); closeVirtualTab(tab.localId); }}
                  onkeydown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); closeVirtualTab(tab.localId); } }}
                  class="text-xs text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer shrink-0"
                >×</span>
              {/if}
            </button>
          {/each}
        </div>
      {/if}

      <!-- Empty state (no sessions) -->
      {#if sessions.length === 0}
        <div class="absolute inset-0 flex items-center justify-center bg-[#0d1117]">
          <div class="text-center space-y-4">
            <div class="text-gray-500 text-lg">Start a Claude session</div>
            <p class="text-xs text-gray-600">Configure in the sidebar and click Start</p>
          </div>
        </div>
      {/if}
    </div>

    <!-- Ended bar for active session -->
    {#if activeSession?.status === 'ended' && !activeSession?.virtual}
      <div class="shrink-0 px-4 py-2 bg-gray-900 border-t border-gray-800 flex items-center gap-3">
        <span class="text-xs text-gray-500">Session ended (exit {activeSession.exitCode})</span>
        <button
          onclick={() => closeTab(activeTabId)}
          class="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs text-gray-300 font-medium transition-colors"
        >
          Close Tab
        </button>
      </div>
    {/if}
  </div>

  <!-- Sidebar -->
  {#if sidebarOpen}
    <div class="w-72 bg-gray-900 border-l border-gray-800 flex flex-col shrink-0 overflow-auto">
      <!-- Header -->
      <div class="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
        <span class="text-sm font-medium text-gray-300">Session</span>
        <button onclick={() => sidebarOpen = false} class="text-xs text-gray-600 hover:text-gray-400">Hide</button>
      </div>

      <!-- Config (collapsible) -->
      <div class="border-b border-gray-800">
        <button
          onclick={() => configOpen = !configOpen}
          class="w-full px-4 py-2 flex items-center justify-between text-xs text-gray-400 hover:text-gray-300 transition-colors"
        >
          <span>Config</span>
          <span>{configOpen ? '▾' : '▸'}</span>
        </button>

        {#if configOpen}
          <div class="px-4 pb-3 space-y-3">
            {#if activeSession}
              {@const s = activeSession}
              {@const cfgDisabled = s.status === 'active' || s.status === 'creating'}
              <div>
                <label class="block text-xs text-gray-500 mb-1">Project</label>
                {#if projects.length > 0}
                  <select
                    bind:value={s.projectPath}
                    disabled={cfgDisabled}
                    onchange={() => { s.label = labelFromPath(s.projectPath); sessions = sessions; }}
                    class="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-blue-500 disabled:opacity-50"
                  >
                    {#each projects as p}
                      <option value={p.path}>{p.name}</option>
                    {/each}
                  </select>
                {/if}
                <input
                  type="text"
                  bind:value={s.projectPath}
                  disabled={cfgDisabled}
                  placeholder="/path/to/project"
                  class="w-full mt-1 bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500 font-mono disabled:opacity-50"
                />
              </div>
              <div>
                <label class="block text-xs text-gray-500 mb-1">Model</label>
                <select
                  bind:value={s.model}
                  disabled={cfgDisabled}
                  class="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-blue-500 disabled:opacity-50"
                >
                  <option value="claude-sonnet-4-6">Sonnet 4.6</option>
                  <option value="claude-opus-4-6">Opus 4.6</option>
                  <option value="claude-haiku-4-5-20251001">Haiku 4.5</option>
                  <option value="claude-sonnet-4-5">Sonnet 4.5</option>
                  <option value="claude-opus-4-5">Opus 4.5</option>
                </select>
              </div>
              <div>
                <label class="block text-xs text-gray-500 mb-1">Permissions</label>
                <select
                  bind:value={s.permissionMode}
                  disabled={cfgDisabled}
                  class="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-blue-500 disabled:opacity-50"
                >
                  <option value="default">Default</option>
                  <option value="acceptEdits">Accept edits</option>
                  <option value="bypassPermissions">Bypass all</option>
                  <option value="plan">Plan (read-only)</option>
                </select>
              </div>
              <div>
                <label class="block text-xs text-gray-500 mb-1">Resume session ID</label>
                <input
                  type="text"
                  bind:value={s.resumeSessionId}
                  disabled={cfgDisabled}
                  placeholder="Optional"
                  class="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500 font-mono disabled:opacity-50"
                />
              </div>
              {#if s.status === 'idle'}
                <button
                  onclick={() => startSession()}
                  disabled={!s.projectPath.trim()}
                  class="w-full py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded transition-colors"
                >Start Session</button>
              {:else if s.status === 'creating'}
                <button disabled class="w-full py-2 bg-blue-600/50 text-white/60 text-sm font-medium rounded cursor-not-allowed">Starting...</button>
              {:else if s.status === 'active'}
                <button
                  onclick={() => endSession()}
                  class="w-full py-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 text-sm font-medium rounded border border-red-700/40 transition-colors"
                >End Session</button>
              {:else if s.status === 'ended'}
                <button
                  onclick={() => closeTab(activeTabId)}
                  class="w-full py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm font-medium rounded transition-colors"
                >Close Tab</button>
              {/if}
            {:else}
              <!-- No active session: bind to template config -->
              <div>
                <label class="block text-xs text-gray-500 mb-1">Project</label>
                {#if projects.length > 0}
                  <select
                    bind:value={projectPath}
                    class="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-blue-500"
                  >
                    {#each projects as p}
                      <option value={p.path}>{p.name}</option>
                    {/each}
                  </select>
                {/if}
                <input
                  type="text"
                  bind:value={projectPath}
                  placeholder="/path/to/project"
                  class="w-full mt-1 bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>
              <div>
                <label class="block text-xs text-gray-500 mb-1">Model</label>
                <select
                  bind:value={model}
                  class="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-blue-500"
                >
                  <option value="claude-sonnet-4-6">Sonnet 4.6</option>
                  <option value="claude-opus-4-6">Opus 4.6</option>
                  <option value="claude-haiku-4-5-20251001">Haiku 4.5</option>
                  <option value="claude-sonnet-4-5">Sonnet 4.5</option>
                  <option value="claude-opus-4-5">Opus 4.5</option>
                </select>
              </div>
              <div>
                <label class="block text-xs text-gray-500 mb-1">Permissions</label>
                <select
                  bind:value={permissionMode}
                  class="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-blue-500"
                >
                  <option value="default">Default</option>
                  <option value="acceptEdits">Accept edits</option>
                  <option value="bypassPermissions">Bypass all</option>
                  <option value="plan">Plan (read-only)</option>
                </select>
              </div>
              <div>
                <label class="block text-xs text-gray-500 mb-1">Resume session ID</label>
                <input
                  type="text"
                  bind:value={resumeSessionId}
                  placeholder="Optional"
                  class="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>
              <button
                onclick={() => {
                  const id = addSession();
                  startSession(id);
                }}
                disabled={!projectPath.trim()}
                class="w-full py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded transition-colors"
              >Start Session</button>
            {/if}
          </div>
        {/if}
      </div>

      <!-- Subagents (collapsible) -->
      {#if activeSessionSubagents.length > 0}
        <div class="border-b border-gray-800">
          <button
            onclick={() => subagentsOpen = !subagentsOpen}
            class="w-full px-4 py-2 flex items-center justify-between text-xs text-gray-400 hover:text-gray-300 transition-colors"
          >
            <span class="flex items-center gap-1.5">
              Subagents
              <span class="px-1.5 py-0.5 bg-gray-800 rounded-full text-[10px] text-gray-400">{activeSessionSubagents.length}</span>
            </span>
            <span>{subagentsOpen ? '▾' : '▸'}</span>
          </button>

          {#if subagentsOpen}
            <div class="px-3 pb-3 space-y-1.5">
              {#each activeSessionSubagents as sa (sa.toolUseId)}
                <div class="px-2 py-1.5 bg-gray-800/50 rounded border border-gray-800">
                  <div class="flex items-center gap-1.5">
                    <span class="w-2 h-2 rounded-full shrink-0 {sa.status === 'running' ? 'bg-green-400 animate-pulse' : sa.status === 'completed' ? 'bg-gray-500' : 'bg-red-400'}"></span>
                    <span class="text-xs text-gray-300 truncate flex-1">{sa.description}</span>
                    <span class="px-1 py-0.5 bg-gray-700 rounded text-[9px] text-gray-500 shrink-0">{sa.subagentType}</span>
                  </div>
                  {#if sa.isBackground}
                    <div class="flex items-center gap-1.5 mt-1">
                      <span class="px-1 py-0.5 bg-blue-900/30 rounded text-[9px] text-blue-400">background</span>
                      <button
                        onclick={() => viewSubagentOutput(sa)}
                        class="px-1.5 py-0.5 bg-gray-700 hover:bg-gray-600 rounded text-[9px] text-gray-300 transition-colors"
                      >View</button>
                    </div>
                  {/if}
                  {#if sa.status === 'completed' && sa.resultSummary}
                    <div class="mt-1 text-[10px] text-gray-500 leading-tight line-clamp-3 break-all">{sa.resultSummary}</div>
                  {/if}
                </div>
              {/each}
            </div>
          {/if}
        </div>
      {/if}

      <!-- Notes & bookmarks (only when active session has ptyId) -->
      {#if activeSession?.ptyId}
        <div class="px-4 py-3 space-y-3">
          <div class="flex items-center gap-2">
            <button
              onclick={toggleBookmark}
              class="text-lg transition-colors {activeSession.bookmarked ? 'text-yellow-400' : 'text-gray-700 hover:text-yellow-400'}"
              title={activeSession.bookmarked ? 'Remove bookmark' : 'Bookmark session'}
            >
              {activeSession.bookmarked ? '★' : '☆'}
            </button>
            <span class="text-xs text-gray-500 font-mono">{activeSession.ptyId.slice(0, 8)}</span>
          </div>

          <!-- Tags -->
          <div>
            <label class="block text-xs text-gray-500 mb-1">Tags</label>
            <div class="flex flex-wrap gap-1 mb-1.5">
              {#each activeSession.tags as tag}
                <span class="inline-flex items-center gap-1 px-1.5 py-0.5 bg-gray-800 rounded text-[10px] text-blue-400">
                  {tag}
                  <button onclick={() => removeTag(tag)} class="text-gray-600 hover:text-red-400">×</button>
                </span>
              {/each}
            </div>
            <div class="flex gap-1">
              <input
                type="text"
                bind:value={tagInput}
                onkeydown={(e) => { if (e.key === 'Enter') addTag(); }}
                placeholder="Add tag..."
                class="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500"
              />
              <button onclick={addTag} class="px-2 py-1 text-xs text-gray-500 hover:text-blue-400 bg-gray-800 border border-gray-700 rounded">+</button>
            </div>
          </div>

          <!-- Notes -->
          <div>
            <label class="block text-xs text-gray-500 mb-1">Notes</label>
            <textarea
              bind:value={activeSession.notes}
              oninput={handleNotesInput}
              rows="4"
              placeholder="Session notes..."
              class="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500 resize-none"
            ></textarea>
          </div>
        </div>
      {/if}
    </div>
  {:else}
    <!-- Collapsed sidebar toggle -->
    <button
      onclick={() => sidebarOpen = true}
      class="w-8 bg-gray-900 border-l border-gray-800 flex items-center justify-center text-gray-600 hover:text-gray-400 shrink-0"
      title="Show sidebar"
    >
      <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
      </svg>
    </button>
  {/if}
</div>
