<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '$lib/api/client.js';

  let botToken = $state('');
  let allowedUserIds = $state('');
  let enabled = $state(false);
  let tokenSet = $state(false);
  let testChatId = $state('');

  let loading = $state(true);
  let saving = $state(false);
  let testing = $state(false);
  let message = $state<{ type: 'success' | 'error'; text: string } | null>(null);

  onMount(async () => {
    try {
      const config = await api.getTelegramConfig();
      botToken = config.botToken;
      allowedUserIds = config.allowedUserIds.join(', ');
      enabled = config.enabled;
      tokenSet = config.tokenSet;
    } catch {
      // Config doesn't exist yet — that's fine
    }
    loading = false;
  });

  async function save() {
    saving = true;
    message = null;
    try {
      const ids = allowedUserIds
        .split(/[,\s]+/)
        .map(s => s.trim())
        .filter(Boolean)
        .map(Number)
        .filter(n => !isNaN(n));

      const result = await api.saveTelegramConfig({
        botToken: botToken || undefined,
        allowedUserIds: ids,
        enabled,
      });
      tokenSet = result.tokenSet;
      botToken = result.botToken;
      message = { type: 'success', text: enabled ? 'Saved and bot started!' : 'Saved. Bot is disabled.' };
    } catch (e) {
      message = { type: 'error', text: e instanceof Error ? e.message : 'Failed to save' };
    }
    saving = false;
  }

  async function testConnection() {
    testing = true;
    message = null;
    try {
      const id = parseInt(testChatId.trim());
      if (isNaN(id)) throw new Error('Enter a valid chat ID');
      const result = await api.testTelegram(id);
      message = { type: result.ok ? 'success' : 'error', text: result.ok ? 'Test message sent!' : 'Failed to send test message' };
    } catch (e) {
      message = { type: 'error', text: e instanceof Error ? e.message : 'Test failed' };
    }
    testing = false;
  }
</script>

<div class="max-w-2xl mx-auto space-y-8">
  <div>
    <h1 class="text-2xl font-bold text-white">Settings</h1>
    <p class="text-sm text-gray-400 mt-1">Configure integrations and preferences</p>
  </div>

  <!-- Telegram Bot Section -->
  <div class="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-6">
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-lg font-semibold text-white flex items-center gap-2">
          <svg class="w-5 h-5 text-blue-400" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z"/>
          </svg>
          Telegram Remote Control
        </h2>
        <p class="text-sm text-gray-400 mt-1">Control Claude sessions from your phone via Telegram</p>
      </div>
      <label class="relative inline-flex items-center cursor-pointer">
        <input type="checkbox" bind:checked={enabled} class="sr-only peer" />
        <div class="w-11 h-6 bg-gray-700 peer-focus:ring-2 peer-focus:ring-blue-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
      </label>
    </div>

    {#if loading}
      <div class="text-gray-500 text-sm">Loading...</div>
    {:else}
      <!-- Setup Instructions -->
      <details class="group">
        <summary class="text-sm text-blue-400 cursor-pointer hover:text-blue-300 flex items-center gap-1">
          <svg class="w-4 h-4 transition-transform group-open:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
          </svg>
          How to set up
        </summary>
        <div class="mt-3 text-sm text-gray-400 space-y-2 pl-5">
          <p><strong class="text-gray-300">1.</strong> Open Telegram and search for <code class="text-blue-300">@BotFather</code></p>
          <p><strong class="text-gray-300">2.</strong> Send <code class="text-blue-300">/newbot</code> and follow the prompts to create a bot</p>
          <p><strong class="text-gray-300">3.</strong> Copy the bot token and paste it below</p>
          <p><strong class="text-gray-300">4.</strong> To get your user ID, message <code class="text-blue-300">@userinfobot</code> on Telegram</p>
          <p><strong class="text-gray-300">5.</strong> Add your user ID to the allowed list below</p>
          <p><strong class="text-gray-300">6.</strong> Toggle the switch on and save</p>
        </div>
      </details>

      <!-- Bot Token -->
      <div class="space-y-2">
        <label for="bot-token" class="block text-sm font-medium text-gray-300">Bot Token</label>
        <input
          id="bot-token"
          type="password"
          bind:value={botToken}
          placeholder={tokenSet ? 'Token is set (enter new to change)' : 'Paste your bot token from @BotFather'}
          class="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
        />
        {#if tokenSet}
          <p class="text-xs text-gray-500">Token is configured. Enter a new one to replace it.</p>
        {/if}
      </div>

      <!-- Allowed User IDs -->
      <div class="space-y-2">
        <label for="user-ids" class="block text-sm font-medium text-gray-300">Allowed Telegram User IDs</label>
        <input
          id="user-ids"
          type="text"
          bind:value={allowedUserIds}
          placeholder="123456789, 987654321"
          class="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
        />
        <p class="text-xs text-gray-500">Comma-separated user IDs. Only these users can interact with the bot.</p>
      </div>

      <!-- Save Button -->
      <div class="flex items-center gap-3">
        <button
          onclick={save}
          disabled={saving}
          class="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>

      <!-- Test Connection -->
      {#if enabled && tokenSet}
        <div class="border-t border-gray-800 pt-4 space-y-3">
          <h3 class="text-sm font-medium text-gray-300">Test Connection</h3>
          <div class="flex gap-2">
            <input
              type="text"
              bind:value={testChatId}
              placeholder="Your Telegram chat ID"
              class="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
            />
            <button
              onclick={testConnection}
              disabled={testing || !testChatId.trim()}
              class="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-600 text-white text-sm rounded-lg transition-colors"
            >
              {testing ? 'Sending...' : 'Send Test'}
            </button>
          </div>
          <p class="text-xs text-gray-500">Send a test message to verify the bot is working. Use your user ID as chat ID.</p>
        </div>
      {/if}

      <!-- Status Message -->
      {#if message}
        <div class="text-sm px-3 py-2 rounded-lg {message.type === 'success' ? 'bg-green-900/30 text-green-400 border border-green-800' : 'bg-red-900/30 text-red-400 border border-red-800'}">
          {message.text}
        </div>
      {/if}

      <!-- Available Commands Reference -->
      {#if enabled && tokenSet}
        <div class="border-t border-gray-800 pt-4">
          <h3 class="text-sm font-medium text-gray-300 mb-2">Bot Commands</h3>
          <div class="grid grid-cols-2 gap-1 text-xs text-gray-400">
            <div><code class="text-gray-300">/new &lt;path&gt;</code> Start session</div>
            <div><code class="text-gray-300">/resume &lt;id&gt;</code> Resume session</div>
            <div><code class="text-gray-300">/end</code> End session</div>
            <div><code class="text-gray-300">/status</code> Session info</div>
            <div><code class="text-gray-300">/sessions</code> List sessions</div>
            <div><code class="text-gray-300">/projects</code> Browse projects</div>
            <div><code class="text-gray-300">/model &lt;name&gt;</code> Switch model</div>
            <div><code class="text-gray-300">/stop</code> Interrupt</div>
          </div>
        </div>
      {/if}
    {/if}
  </div>
</div>
