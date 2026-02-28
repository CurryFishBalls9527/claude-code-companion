<script lang="ts">
  import { onMount, onDestroy } from 'svelte';

  let { visible = true }: { visible?: boolean } = $props();

  let container: HTMLElement;
  let term: import('@xterm/xterm').Terminal | null = null;
  let fitAddon: import('@xterm/addon-fit').FitAddon | null = null;
  let resizeObserver: ResizeObserver | null = null;

  export function write(data: string) {
    term?.write(data);
  }

  export function clear() {
    term?.clear();
  }

  onMount(async () => {
    const { Terminal } = await import('@xterm/xterm');
    const { FitAddon } = await import('@xterm/addon-fit');
    // @ts-ignore — CSS side effect
    await import('@xterm/xterm/css/xterm.css').catch(() => {});

    term = new Terminal({
      theme: {
        background: '#0d1117',
        foreground: '#c9d1d9',
        cursor: '#58a6ff',
        selectionBackground: '#264f78',
        black: '#0d1117',
        red: '#ff7b72',
        green: '#3fb950',
        yellow: '#d29922',
        blue: '#58a6ff',
        magenta: '#bc8cff',
        cyan: '#39c5cf',
        white: '#b1bac4',
      },
      fontSize: 12,
      fontFamily: 'ui-monospace, "Cascadia Code", "Source Code Pro", Menlo, monospace',
      lineHeight: 1.4,
      cursorBlink: false,
      convertEol: true,
    });

    fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(container);
    fitAddon.fit();

    resizeObserver = new ResizeObserver(() => fitAddon?.fit());
    resizeObserver.observe(container);
  });

  onDestroy(() => {
    resizeObserver?.disconnect();
    term?.dispose();
  });

  $effect(() => {
    if (visible && fitAddon) {
      setTimeout(() => fitAddon?.fit(), 50);
    }
  });
</script>

<div
  bind:this={container}
  class="w-full h-full bg-[#0d1117] overflow-hidden"
  style="display: {visible ? 'block' : 'none'};"
></div>
