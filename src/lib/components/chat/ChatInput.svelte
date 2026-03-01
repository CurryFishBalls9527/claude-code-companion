<script lang="ts">
  import type { SlashCommand, AgentInfo } from '$lib/stores/chat.js';
  import SlashCommandMenu from './SlashCommandMenu.svelte';
  import AgentMentionMenu from './AgentMentionMenu.svelte';

  let {
    disabled = false,
    onSend,
    onSlashCommand,
    placeholder = 'Message Claude... (Enter to send, Shift+Enter for newline)',
    availableCommands = [],
    availableAgents = [],
  }: {
    disabled?: boolean;
    onSend: (text: string) => void;
    onSlashCommand?: (command: SlashCommand, args: string) => void;
    placeholder?: string;
    availableCommands?: SlashCommand[];
    availableAgents?: AgentInfo[];
  } = $props();

  let value = $state('');
  let historyIndex = $state(-1);
  let history = $state<string[]>([]);
  let savedDraft = '';
  let textarea: HTMLTextAreaElement;

  // Menu state
  let showSlashMenu = $state(false);
  let slashFilter = $state('');
  let showAgentMenu = $state(false);
  let agentFilter = $state('');

  let slashMenuRef: SlashCommandMenu;
  let agentMenuRef: AgentMentionMenu;

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
    showSlashMenu = false;
    showAgentMenu = false;
    if (textarea) textarea.style.height = 'auto';
  }

  function handleInput(e: Event) {
    const text = (e.target as HTMLTextAreaElement).value;

    // Slash command detection: "/" at start of input
    if (text.startsWith('/')) {
      showSlashMenu = true;
      slashFilter = text.slice(1).split(' ')[0] ?? '';
      showAgentMenu = false;
    } else {
      showSlashMenu = false;
    }

    // Agent mention detection: "@" at start or after space
    const atMatch = text.match(/(^|\s)@(\w*)$/);
    if (atMatch && availableAgents.length > 0) {
      showAgentMenu = true;
      agentFilter = atMatch[2] ?? '';
      showSlashMenu = false;
    } else if (!text.includes('@')) {
      showAgentMenu = false;
    }
  }

  function handleSlashSelect(cmd: SlashCommand) {
    showSlashMenu = false;
    if (onSlashCommand) {
      const args = value.includes(' ') ? value.slice(value.indexOf(' ') + 1) : '';
      onSlashCommand(cmd, args);
      value = '';
      if (textarea) textarea.style.height = 'auto';
    } else {
      // Fallback: send as text
      value = '/' + cmd.name;
      send();
    }
  }

  function handleAgentSelect(agent: AgentInfo) {
    showAgentMenu = false;
    // Replace the @partial with @AgentName and a trailing space
    const atMatch = value.match(/(^|\s)@\w*$/);
    if (atMatch) {
      const prefix = value.slice(0, atMatch.index! + (atMatch[1]?.length ?? 0));
      value = prefix + '@' + agent.name + ' ';
    }
    textarea?.focus();
  }

  function handleKeydown(e: KeyboardEvent) {
    // Delegate to menus if open
    if (showSlashMenu && slashMenuRef?.handleKeydown(e)) {
      if (e.key === 'Escape') showSlashMenu = false;
      return;
    }
    if (showAgentMenu && agentMenuRef?.handleKeydown(e)) {
      if (e.key === 'Escape') showAgentMenu = false;
      return;
    }

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

<div class="relative flex items-end gap-2 p-3 border-t border-gray-800 bg-gray-950">
  <!-- Slash command menu -->
  {#if showSlashMenu}
    <SlashCommandMenu
      bind:this={slashMenuRef}
      commands={availableCommands}
      filter={slashFilter}
      onSelect={handleSlashSelect}
    />
  {/if}

  <!-- Agent mention menu -->
  {#if showAgentMenu}
    <AgentMentionMenu
      bind:this={agentMenuRef}
      agents={availableAgents}
      filter={agentFilter}
      onSelect={handleAgentSelect}
    />
  {/if}

  <textarea
    bind:this={textarea}
    bind:value
    onkeydown={handleKeydown}
    oninput={(e) => { autoResize(e); handleInput(e); }}
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
