<script lang="ts">
  import { onMount } from 'svelte';

  let { code, lang = 'text' }: { code: string; lang?: string } = $props();
  let highlighted = $state('');
  let container: HTMLElement;

  onMount(async () => {
    try {
      const { codeToHtml } = await import('shiki');
      highlighted = await codeToHtml(code, {
        lang,
        theme: 'github-dark',
      });
    } catch {
      // Fallback to plain text on error
      highlighted = `<pre class="shiki"><code>${escapeHtml(code)}</code></pre>`;
    }
  });

  function escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
</script>

<div class="rounded-lg overflow-auto text-sm" bind:this={container}>
  {#if highlighted}
    <!-- eslint-disable-next-line svelte/no-at-html-tags -->
    {@html highlighted}
  {:else}
    <pre class="bg-gray-900 border border-gray-700 rounded p-4 overflow-auto text-gray-300 text-sm"><code>{code}</code></pre>
  {/if}
</div>

<style>
  :global(.shiki) {
    padding: 1rem;
    border-radius: 0.5rem;
    border: 1px solid rgb(55 65 81);
    overflow: auto;
    font-size: 0.875rem;
  }
</style>
