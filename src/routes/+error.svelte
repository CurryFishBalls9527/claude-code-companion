<script lang="ts">
  import { page } from '$app/stores';
</script>

<div class="flex flex-col items-center justify-center min-h-[60vh] gap-4">
  <div class="text-5xl">⚠️</div>
  <h1 class="text-2xl font-bold text-white">{$page.status}</h1>
  <p class="text-gray-400">{$page.error?.message ?? 'An unexpected error occurred'}</p>
  <a href="/" class="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm text-white">
    Go to Dashboard
  </a>
</div>
