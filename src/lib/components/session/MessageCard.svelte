<script lang="ts">
  import type { ProcessedMessage } from '$shared/types.js';
  import ThinkingBlock from './ThinkingBlock.svelte';
  import ToolCallCard from './ToolCallCard.svelte';
  import MarkdownRenderer from '$lib/components/shared/MarkdownRenderer.svelte';

  let { message }: { message: ProcessedMessage } = $props();
</script>

<div class="rounded-lg border overflow-hidden {message.role === 'user' ? 'border-gray-700 bg-gray-900' : 'border-gray-800 bg-gray-950'}">
  <!-- Header -->
  <div class="flex items-center gap-2 px-4 py-2 border-b {message.role === 'user' ? 'border-gray-700 bg-gray-800/50' : 'border-gray-800 bg-gray-900/50'}">
    <span class="text-xs font-semibold {message.role === 'user' ? 'text-blue-400' : 'text-green-400'}">
      {message.role === 'user' ? 'You' : 'Claude'}
    </span>
    {#if message.model}
      <span class="text-xs text-gray-600">{message.model}</span>
    {/if}
    {#if message.usage}
      <span class="text-xs text-gray-600 ml-auto">
        {(message.usage.input_tokens + message.usage.output_tokens).toLocaleString()} tokens
      </span>
    {/if}
    <span class="text-xs text-gray-600 {message.usage ? '' : 'ml-auto'}">
      {new Date(message.timestamp).toLocaleTimeString()}
    </span>
  </div>

  <!-- Content -->
  <div class="px-4 py-3 space-y-2">
    {#if message.thinking}
      <ThinkingBlock thinking={message.thinking} />
    {/if}

    {#if message.role === 'user' && message.userText}
      <div class="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">{message.userText}</div>
    {/if}

    {#if message.role === 'assistant' && message.text}
      <div class="text-sm text-gray-200 leading-relaxed">
        <MarkdownRenderer content={message.text} />
      </div>
    {/if}

    {#if message.toolCalls && message.toolCalls.length > 0}
      <div class="space-y-1 mt-2">
        {#each message.toolCalls as toolCall}
          <ToolCallCard {toolCall} />
        {/each}
      </div>
    {/if}
  </div>
</div>
