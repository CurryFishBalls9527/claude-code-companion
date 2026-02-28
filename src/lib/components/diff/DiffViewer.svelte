<script lang="ts">
  import { onMount } from 'svelte';
  import type { FileDiff } from '$shared/types.js';

  let { diff }: { diff: FileDiff } = $props();
  let container: HTMLElement;
  let mode = $state<'unified' | 'split'>('unified');

  async function render() {
    if (!container) return;
    const { html, Diff2HtmlUI } = await import('diff2html');

    const diffHtml = html(diff.unifiedDiff, {
      drawFileList: false,
      matching: 'lines',
      outputFormat: mode === 'split' ? 'side-by-side' : 'line-by-line',
    });

    const ui = new Diff2HtmlUI(container, diff.unifiedDiff, {
      drawFileList: false,
      matching: 'lines',
      outputFormat: mode === 'split' ? 'side-by-side' : 'line-by-line',
      highlight: true,
      fileContentToggle: false,
    });
    ui.draw();
    ui.highlightCode();
  }

  onMount(render);
  $effect(() => {
    mode; // track reactivity
    render();
  });
</script>

<svelte:head>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/diff2html@3.4.48/bundles/css/diff2html.min.css" />
</svelte:head>

<div class="space-y-2">
  <div class="flex items-center gap-2">
    <span class="text-xs font-mono text-gray-400 flex-1 truncate">{diff.filePath}</span>
    <span class="text-xs text-green-500">+{diff.linesAdded}</span>
    <span class="text-xs text-red-400">-{diff.linesRemoved}</span>
    <button
      onclick={() => (mode = mode === 'unified' ? 'split' : 'unified')}
      class="text-xs px-2 py-1 bg-gray-800 border border-gray-700 rounded hover:bg-gray-700 text-gray-400"
    >
      {mode === 'unified' ? 'Split' : 'Unified'}
    </button>
  </div>
  <div bind:this={container} class="diff2html-dark rounded overflow-auto text-xs"></div>
</div>

<style>
  :global(.diff2html-dark .d2h-wrapper) {
    background: transparent;
  }
  :global(.diff2html-dark .d2h-file-header) {
    background: #1f2937;
    border-color: #374151;
    color: #9ca3af;
  }
  :global(.diff2html-dark .d2h-code-linenumber) {
    background: #111827;
    border-color: #1f2937;
    color: #4b5563;
  }
  :global(.diff2html-dark .d2h-code-line) {
    background: #111827;
    color: #d1d5db;
  }
  :global(.diff2html-dark .d2h-ins) {
    background: #14532d40;
  }
  :global(.diff2html-dark .d2h-del) {
    background: #7f1d1d40;
  }
  :global(.diff2html-dark .d2h-ins .d2h-code-line-ctn) {
    background: #14532d60;
  }
  :global(.diff2html-dark .d2h-del .d2h-code-line-ctn) {
    background: #7f1d1d60;
  }
  :global(.diff2html-dark table) {
    width: 100%;
  }
</style>
