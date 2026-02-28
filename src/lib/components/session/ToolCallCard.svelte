<script lang="ts">
  import type { ProcessedToolCall } from '$shared/types.js';

  let { toolCall }: { toolCall: ProcessedToolCall } = $props();
  let expanded = $state(false);

  const toolColor: Record<string, string> = {
    Edit: 'bg-yellow-900/40 text-yellow-300 border-yellow-700/50',
    Write: 'bg-blue-900/40 text-blue-300 border-blue-700/50',
    Read: 'bg-gray-800 text-gray-300 border-gray-700',
    Bash: 'bg-green-900/40 text-green-300 border-green-700/50',
    Grep: 'bg-cyan-900/40 text-cyan-300 border-cyan-700/50',
    Glob: 'bg-cyan-900/40 text-cyan-300 border-cyan-700/50',
    Task: 'bg-purple-900/40 text-purple-300 border-purple-700/50',
  };

  const colorClass = toolColor[toolCall.name] ?? 'bg-gray-800 text-gray-400 border-gray-700';

  function summarize(tc: ProcessedToolCall): string {
    const input = tc.input;
    if (tc.name === 'Edit') return `${input.file_path as string}`;
    if (tc.name === 'Write') return `${input.file_path as string}`;
    if (tc.name === 'Read') return `${input.file_path as string}`;
    if (tc.name === 'Bash') return String(input.command ?? '').slice(0, 80);
    if (tc.name === 'Grep') return `"${input.pattern}" in ${input.path ?? '.'}`;
    if (tc.name === 'Glob') return `${input.pattern}`;
    return JSON.stringify(input).slice(0, 80);
  }
</script>

<div class="my-1.5 rounded border {colorClass} text-xs overflow-hidden">
  <button
    onclick={() => (expanded = !expanded)}
    class="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/5 transition-colors"
  >
    <svg
      class="h-3 w-3 shrink-0 transition-transform {expanded ? 'rotate-90' : ''}"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
    </svg>
    <span class="font-bold shrink-0">{toolCall.name}</span>
    <span class="truncate opacity-70 font-mono">{summarize(toolCall)}</span>
    {#if toolCall.isError}
      <span class="ml-auto shrink-0 text-red-400">error</span>
    {/if}
  </button>

  {#if expanded}
    <div class="border-t border-current/20 p-3 space-y-2">
      <!-- Input -->
      <div>
        <div class="text-gray-500 mb-1 font-semibold uppercase tracking-wide text-[10px]">Input</div>
        {#if toolCall.name === 'Edit'}
          <div class="grid grid-cols-2 gap-2">
            <div>
              <div class="text-[10px] text-red-400 mb-1">old_string</div>
              <pre class="bg-red-950/30 border border-red-800/30 rounded p-2 text-red-300 overflow-auto max-h-40 text-[11px] whitespace-pre-wrap">{toolCall.input.old_string as string}</pre>
            </div>
            <div>
              <div class="text-[10px] text-green-400 mb-1">new_string</div>
              <pre class="bg-green-950/30 border border-green-800/30 rounded p-2 text-green-300 overflow-auto max-h-40 text-[11px] whitespace-pre-wrap">{toolCall.input.new_string as string}</pre>
            </div>
          </div>
        {:else}
          <pre class="bg-black/30 rounded p-2 overflow-auto max-h-60 text-gray-300 font-mono text-[11px]">{JSON.stringify(toolCall.input, null, 2)}</pre>
        {/if}
      </div>

      <!-- Result -->
      {#if toolCall.result !== undefined}
        <div>
          <div class="text-gray-500 mb-1 font-semibold uppercase tracking-wide text-[10px]">
            Result {toolCall.isError ? '(error)' : ''}
          </div>
          <pre class="bg-black/30 rounded p-2 overflow-auto max-h-40 {toolCall.isError ? 'text-red-300' : 'text-gray-300'} font-mono text-[11px]">{toolCall.result}</pre>
        </div>
      {/if}
    </div>
  {/if}
</div>
