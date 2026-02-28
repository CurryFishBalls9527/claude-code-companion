<script lang="ts">
  let {
    disabled = false,
    onSend,
    placeholder = 'Message Claude… (Enter to send, Shift+Enter for newline)',
  }: {
    disabled?: boolean;
    onSend: (text: string) => void;
    placeholder?: string;
  } = $props();

  let value = $state('');
  let historyIndex = $state(-1);
  let history = $state<string[]>([]);
  let savedDraft = '';
  let textarea: HTMLTextAreaElement;

  export function pushHistory(text: string) {
    history = [text, ...history.slice(0, 49)];
    historyIndex = -1;
  }

  function send() {
    const text = value.trim();
    if (!text || disabled) return;
    onSend(text);
    pushHistory(text);
    value = '';
    historyIndex = -1;
    savedDraft = '';
    // Reset textarea height
    if (textarea) textarea.style.height = 'auto';
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
      return;
    }

    if (e.key === 'ArrowUp' && !value.trim()) {
      e.preventDefault();
      if (historyIndex === -1) savedDraft = value;
      if (historyIndex < history.length - 1) {
        historyIndex++;
        value = history[historyIndex] ?? '';
      }
      return;
    }

    if (e.key === 'ArrowDown' && historyIndex >= 0) {
      e.preventDefault();
      historyIndex--;
      value = historyIndex === -1 ? savedDraft : (history[historyIndex] ?? '');
      return;
    }
  }

  function autoResize(e: Event) {
    const el = e.target as HTMLTextAreaElement;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
  }
</script>

<div class="flex items-end gap-2 p-3 border-t border-gray-800 bg-gray-950">
  <textarea
    bind:this={textarea}
    bind:value
    onkeydown={handleKeydown}
    oninput={autoResize}
    {placeholder}
    {disabled}
    rows="1"
    class="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-gray-200 placeholder-gray-500
           focus:outline-none focus:border-blue-500 resize-none leading-relaxed
           disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
    style="min-height: 42px; max-height: 200px;"
  ></textarea>
  <button
    onclick={send}
    {disabled}
    class="shrink-0 flex items-center justify-center w-9 h-9 rounded-xl bg-blue-600 hover:bg-blue-500
           disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
    title="Send (Enter)"
  >
    <svg class="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
      <path stroke-linecap="round" stroke-linejoin="round" d="M12 19V5m0 0l-7 7m7-7l7 7" />
    </svg>
  </button>
</div>
