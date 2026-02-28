<script lang="ts">
  import { marked } from 'marked';
  import DOMPurify from 'dompurify';

  let { content }: { content: string } = $props();

  const html = $derived(
    DOMPurify.sanitize(marked.parse(content, { async: false }) as string)
  );
</script>

<div class="prose prose-invert prose-sm max-w-none prose-pre:bg-gray-900 prose-pre:border prose-pre:border-gray-700">
  <!-- eslint-disable-next-line svelte/no-at-html-tags -->
  {@html html}
</div>
