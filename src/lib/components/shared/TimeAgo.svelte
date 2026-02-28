<script lang="ts">
  let { timestamp }: { timestamp: string } = $props();

  function timeAgo(ts: string): string {
    const date = new Date(ts);
    const now = Date.now();
    const diffMs = now - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    if (diffSec < 60) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHour < 24) return `${diffHour}h ago`;
    if (diffDay < 7) return `${diffDay}d ago`;
    return date.toLocaleDateString();
  }
</script>

<span title={new Date(timestamp).toLocaleString()}>
  {timeAgo(timestamp)}
</span>
