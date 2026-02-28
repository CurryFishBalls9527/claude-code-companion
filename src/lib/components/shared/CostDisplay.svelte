<script lang="ts">
  let { cost }: { cost: number } = $props();
  const formatted = $derived(cost < 0.01 ? '<$0.01' : `$${cost.toFixed(3)}`);
</script>

<span>{formatted}</span>
