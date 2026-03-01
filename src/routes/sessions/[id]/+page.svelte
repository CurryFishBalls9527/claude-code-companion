<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { api } from '$lib/api/client.js';
  import type { SessionDetail, SessionMeta, FileDiff } from '$shared/types.js';
  import { toggleBookmark, updateTags, updateNotes } from '$lib/stores/meta.js';
  import MessageCard from '$lib/components/session/MessageCard.svelte';
  import DiffViewer from '$lib/components/diff/DiffViewer.svelte';
  import LoadingSpinner from '$lib/components/shared/LoadingSpinner.svelte';
  import Badge from '$lib/components/shared/Badge.svelte';

  const id = $derived($page.params.id);

  let session = $state<SessionDetail | null>(null);
  let meta = $state<SessionMeta | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let replayStep = $state(-1);
  let replayMode = $state(false);

  // Diff mode
  let diffMode = $state(false);
  let diffs = $state<FileDiff[]>([]);
  let diffsLoading = $state(false);

  // Tags editing
  let newTag = $state('');
  let savingTag = $state(false);

  // Notes editing
  let notesValue = $state('');
  let notesDirty = $state(false);
  let savingNotes = $state(false);
  let notesDebounce: ReturnType<typeof setTimeout>;

  // Bookmark
  let bookmarkLoading = $state(false);

  onMount(async () => {
    try {
      [session, meta] = await Promise.all([
        api.getSession(id),
        api.getSessionMeta(id).catch(() => null),
      ]);
      notesValue = meta?.notes ?? '';
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load session';
    } finally {
      loading = false;
    }
  });

  async function handleBookmark() {
    if (!meta || bookmarkLoading) return;
    bookmarkLoading = true;
    try {
      meta = await toggleBookmark(id, meta.bookmarked);
    } finally {
      bookmarkLoading = false;
    }
  }

  async function addTag() {
    const tag = newTag.trim();
    if (!tag || savingTag) return;
    savingTag = true;
    try {
      const tags = [...(meta?.tags ?? []), tag];
      meta = await updateTags(id, tags);
      newTag = '';
    } finally {
      savingTag = false;
    }
  }

  async function removeTag(tag: string) {
    const tags = (meta?.tags ?? []).filter((t) => t !== tag);
    meta = await updateTags(id, tags);
  }

  function handleTagKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') { e.preventDefault(); addTag(); }
  }

  function handleNotesChange() {
    notesDirty = true;
    clearTimeout(notesDebounce);
    notesDebounce = setTimeout(async () => {
      savingNotes = true;
      try {
        meta = await updateNotes(id, notesValue);
        notesDirty = false;
      } finally {
        savingNotes = false;
      }
    }, 800);
  }

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

  // Messages that contain Edit or Write tool calls
  const diffMessages = $derived(
    visibleMessages.filter((m) =>
      m.toolCalls?.some((tc) => tc.name === 'Edit' || tc.name === 'Write')
    )
  );

  // Map tool call IDs to their diffs for quick lookup
  const diffsByToolCallId = $derived.by(() => {
    const map = new Map<string, FileDiff>();
    for (const d of diffs) map.set(d.toolCallId, d);
    return map;
  });

  async function toggleDiffMode() {
    if (diffMode) {
      diffMode = false;
      return;
    }
    diffMode = true;
    if (diffs.length === 0) {
      diffsLoading = true;
      try {
        diffs = await api.getSessionDiffs(id);
      } catch (e) {
        console.error('Failed to load diffs:', e);
      } finally {
        diffsLoading = false;
      }
    }
  }

  function startReplay() { replayMode = true; replayStep = 0; }
  function stopReplay() { replayMode = false; replayStep = -1; }
</script>

<div class="space-y-4 h-full flex flex-col">
  {#if loading}
    <LoadingSpinner />
  {:else if error}
    <div class="text-red-400">{error}</div>
  {:else if session}
    <!-- Header -->
    <div class="flex items-start gap-4">
      <div class="flex-1 min-w-0">
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
        <div class="flex gap-2 justify-end mt-2 flex-wrap">
          <!-- Bookmark -->
          <button
            onclick={handleBookmark}
            disabled={bookmarkLoading}
            class="flex items-center gap-1 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-xs hover:bg-gray-700 disabled:opacity-50 transition-colors"
            title={meta?.bookmarked ? 'Remove bookmark' : 'Bookmark'}
          >
            <svg class="h-3.5 w-3.5 {meta?.bookmarked ? 'text-yellow-400 fill-yellow-400' : 'text-gray-400'}" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
            </svg>
            {meta?.bookmarked ? 'Bookmarked' : 'Bookmark'}
          </button>
          <a
            href="/chat?resume={session.id}&project={encodeURIComponent(session.projectPath)}"
            class="px-3 py-1 bg-green-800/60 border border-green-700/60 rounded text-xs text-green-300 hover:bg-green-700/60"
          >
            Resume in Chat
          </a>
          <!-- Export -->
          <a
            href={api.getExportUrl(session.id, 'markdown')}
            download="{session.id}.md"
            class="px-3 py-1 bg-gray-800 border border-gray-700 rounded text-xs hover:bg-gray-700"
          >
            Export MD
          </a>
          <a
            href={api.getExportUrl(session.id, 'json')}
            download="{session.id}.json"
            class="px-3 py-1 bg-gray-800 border border-gray-700 rounded text-xs hover:bg-gray-700"
          >
            Export JSON
          </a>
        </div>
      </div>
    </div>

    <!-- Tags + Notes panel -->
    <div class="bg-gray-900 border border-gray-800 rounded-lg px-4 py-3 space-y-3">
      <!-- Tags -->
      <div>
        <div class="text-xs text-gray-500 mb-2 font-medium">Tags</div>
        <div class="flex flex-wrap items-center gap-2">
          {#each (meta?.tags ?? []) as tag}
            <span class="flex items-center gap-1 text-xs px-2 py-0.5 bg-indigo-900/40 text-indigo-400 rounded-full border border-indigo-800/50">
              {tag}
              <button
                onclick={() => removeTag(tag)}
                class="text-indigo-500 hover:text-indigo-300 ml-0.5 leading-none"
                aria-label="Remove tag"
              >×</button>
            </span>
          {/each}
          <div class="flex items-center gap-1">
            <input
              type="text"
              bind:value={newTag}
              onkeydown={handleTagKeydown}
              placeholder="Add tag…"
              class="bg-gray-800 border border-gray-700 rounded px-2 py-0.5 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-indigo-500 w-24"
            />
            <button
              onclick={addTag}
              disabled={savingTag || !newTag.trim()}
              class="text-xs px-2 py-0.5 bg-gray-700 border border-gray-600 rounded text-gray-300 hover:bg-gray-600 disabled:opacity-40"
            >+</button>
          </div>
        </div>
      </div>

      <!-- Notes -->
      <div>
        <div class="flex items-center gap-2 mb-2">
          <span class="text-xs text-gray-500 font-medium">Notes</span>
          {#if savingNotes}
            <span class="text-xs text-gray-600">saving…</span>
          {:else if notesDirty}
            <span class="text-xs text-gray-600">unsaved</span>
          {:else if meta?.notes}
            <span class="text-xs text-gray-700">saved</span>
          {/if}
        </div>
        <textarea
          bind:value={notesValue}
          oninput={handleNotesChange}
          placeholder="Add notes about this session…"
          rows="3"
          class="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500 resize-none"
        ></textarea>
      </div>
    </div>

    <!-- Replay / Diff controls -->
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
        <button
          onclick={toggleDiffMode}
          class="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs transition-colors {diffMode
            ? 'bg-orange-700/40 border border-orange-600/50 text-orange-300'
            : 'bg-gray-800 border border-gray-700 text-gray-400 hover:bg-gray-700'}"
        >
          <svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h8m-8 6h16" />
          </svg>
          {diffMode ? 'Show All' : 'Diffs Only'}
          {#if session.editCount > 0}
            <span class="text-[10px] opacity-70">({session.editCount})</span>
          {/if}
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
      {#if diffMode}
        {#if diffsLoading}
          <LoadingSpinner />
        {:else if diffMessages.length === 0}
          <div class="text-center text-sm text-gray-500 py-8">No file edits in this session</div>
        {:else}
          {#each diffMessages as message (message.uuid)}
            <div class="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
              <!-- Compact message header -->
              <div class="px-4 py-2 border-b border-gray-800 flex items-center gap-3">
                <span class="text-[10px] text-gray-600 font-mono">{new Date(message.timestamp).toLocaleTimeString()}</span>
                <span class="text-xs text-gray-400 truncate flex-1">
                  {message.text?.slice(0, 120) ?? ''}
                  {#if message.text && message.text.length > 120}...{/if}
                </span>
                <span class="text-[10px] text-gray-600">
                  {message.toolCalls?.filter((tc) => tc.name === 'Edit' || tc.name === 'Write').length} edit{message.toolCalls?.filter((tc) => tc.name === 'Edit' || tc.name === 'Write').length === 1 ? '' : 's'}
                </span>
              </div>
              <!-- Diffs for this message -->
              <div class="p-3 space-y-4">
                {#each (message.toolCalls ?? []).filter((tc) => tc.name === 'Edit' || tc.name === 'Write') as tc (tc.id)}
                  {@const fileDiff = diffsByToolCallId.get(tc.id)}
                  {#if fileDiff}
                    <DiffViewer diff={fileDiff} />
                  {:else}
                    <!-- Fallback: show raw old/new from tool input -->
                    <div class="space-y-1">
                      <div class="text-xs font-mono text-gray-400 truncate">{tc.input.file_path ?? 'unknown file'}</div>
                      {#if tc.name === 'Edit' && tc.input.old_string != null}
                        <div class="rounded border border-gray-700 overflow-hidden text-xs font-mono">
                          <div class="bg-red-950/30 px-3 py-1.5 text-red-300 whitespace-pre-wrap break-all">- {tc.input.old_string}</div>
                          <div class="bg-green-950/30 px-3 py-1.5 text-green-300 whitespace-pre-wrap break-all">+ {tc.input.new_string}</div>
                        </div>
                      {:else}
                        <div class="text-[10px] text-gray-600">{tc.name} (no diff available)</div>
                      {/if}
                    </div>
                  {/if}
                {/each}
              </div>
            </div>
          {/each}
        {/if}
      {:else}
        {#each visibleMessages as message (message.uuid)}
          <div class="animate-in fade-in duration-200 group relative">
            <MessageCard {message} />
            {#if message.role === 'assistant' && session}
              <a
                href="/chat?resume={session.id}&project={encodeURIComponent(session.projectPath)}"
                class="absolute top-2 right-2 opacity-0 group-hover:opacity-100 px-2 py-0.5 bg-gray-700/80 border border-gray-600 rounded text-[10px] text-gray-400 hover:text-green-300 hover:border-green-600/40 transition-all"
              >
                Resume from here
              </a>
            {/if}
          </div>
        {/each}
      {/if}
    </div>
  {/if}
</div>
