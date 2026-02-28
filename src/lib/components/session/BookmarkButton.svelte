<script lang="ts">
  import { toggleBookmark } from '$lib/stores/meta.js';

  let { sessionId, bookmarked }: { sessionId: string; bookmarked: boolean } = $props();
  let loading = $state(false);

  async function handleClick(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (loading) return;
    loading = true;
    try {
      const updated = await toggleBookmark(sessionId, bookmarked);
      bookmarked = updated.bookmarked;
    } finally {
      loading = false;
    }
  }
</script>

<button
  onclick={handleClick}
  class="p-1 rounded hover:bg-gray-700/50 transition-colors {loading ? 'opacity-50' : ''}"
  title={bookmarked ? 'Remove bookmark' : 'Bookmark session'}
>
  <svg
    class="h-4 w-4 {bookmarked ? 'text-yellow-400 fill-yellow-400' : 'text-gray-600 hover:text-gray-400'}"
    viewBox="0 0 24 24"
    stroke="currentColor"
    stroke-width="2"
  >
    <path stroke-linecap="round" stroke-linejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
  </svg>
</button>
