<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { api } from '$lib/api/client.js';
  import type { SessionDetail, SessionMeta } from '$shared/types.js';
  import { toggleBookmark, updateTags, updateNotes } from '$lib/stores/meta.js';
  import MessageCard from '$lib/components/session/MessageCard.svelte';
  import LoadingSpinner from '$lib/components/shared/LoadingSpinner.svelte';
  import Badge from '$lib/components/shared/Badge.svelte';

  const id = $derived($page.params.id);

  let session = $state<SessionDetail | null>(null);
  let meta = $state<SessionMeta | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let replayStep = $state(-1);
  let replayMode = $state(false);

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
          <a
            href="/diffs/{session.id}"
            class="px-3 py-1 bg-gray-800 border border-gray-700 rounded text-xs hover:bg-gray-700"
          >
            View Diffs
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
