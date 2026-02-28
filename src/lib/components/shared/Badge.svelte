<script lang="ts">
  let { label, color = 'gray' }: { label: string; color?: 'gray' | 'blue' | 'green' | 'yellow' | 'red' | 'purple' } = $props();
  const colorClass = {
    gray: 'bg-gray-700 text-gray-300',
    blue: 'bg-blue-900/50 text-blue-300',
    green: 'bg-green-900/50 text-green-300',
    yellow: 'bg-yellow-900/50 text-yellow-300',
    red: 'bg-red-900/50 text-red-300',
    purple: 'bg-purple-900/50 text-purple-300',
  }[color];
</script>

<span class="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium {colorClass}">
  {label}
</span>
