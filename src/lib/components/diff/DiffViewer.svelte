<script lang="ts">
  import type { FileDiff } from '$shared/types.js';

  let { diff }: { diff: FileDiff } = $props();
  let mode = $state<'unified' | 'split'>('unified');

  interface DiffLine {
    type: 'context' | 'add' | 'del' | 'hunk';
    oldNum: number | null;
    newNum: number | null;
    text: string;
  }

  const lines = $derived(parseDiff(diff.unifiedDiff));

  // For split view, pair up old/new lines
  const splitPairs = $derived(buildSplitPairs(lines));

  function parseDiff(raw: string): DiffLine[] {
    const result: DiffLine[] = [];
    let oldNum = 0;
    let newNum = 0;

    for (const line of raw.split('\n')) {
      if (line.startsWith('@@')) {
        const match = line.match(/@@ -(\d+)/);
        if (match) {
          oldNum = parseInt(match[1]) - 1;
          const newMatch = line.match(/\+(\d+)/);
          newNum = newMatch ? parseInt(newMatch[1]) - 1 : oldNum;
        }
        result.push({ type: 'hunk', oldNum: null, newNum: null, text: line });
      } else if (line.startsWith('---') || line.startsWith('+++') || line.startsWith('diff ') || line.startsWith('index ')) {
        // skip file headers
      } else if (line.startsWith('-')) {
        oldNum++;
        result.push({ type: 'del', oldNum, newNum: null, text: line.slice(1) });
      } else if (line.startsWith('+')) {
        newNum++;
        result.push({ type: 'add', oldNum: null, newNum, text: line.slice(1) });
      } else {
        oldNum++;
        newNum++;
        result.push({ type: 'context', oldNum, newNum, text: line.startsWith(' ') ? line.slice(1) : line });
      }
    }
    return result;
  }

  interface SplitPair {
    left: { num: number | null; text: string; type: 'context' | 'del' | 'empty' | 'hunk' };
    right: { num: number | null; text: string; type: 'context' | 'add' | 'empty' | 'hunk' };
  }

  function buildSplitPairs(lines: DiffLine[]): SplitPair[] {
    const pairs: SplitPair[] = [];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (line.type === 'hunk') {
        pairs.push({
          left: { num: null, text: line.text, type: 'hunk' },
          right: { num: null, text: '', type: 'hunk' },
        });
        i++;
      } else if (line.type === 'context') {
        pairs.push({
          left: { num: line.oldNum, text: line.text, type: 'context' },
          right: { num: line.newNum, text: line.text, type: 'context' },
        });
        i++;
      } else {
        // Collect consecutive del/add blocks
        const dels: DiffLine[] = [];
        const adds: DiffLine[] = [];
        while (i < lines.length && lines[i].type === 'del') { dels.push(lines[i]); i++; }
        while (i < lines.length && lines[i].type === 'add') { adds.push(lines[i]); i++; }
        const max = Math.max(dels.length, adds.length);
        for (let j = 0; j < max; j++) {
          pairs.push({
            left: j < dels.length
              ? { num: dels[j].oldNum, text: dels[j].text, type: 'del' }
              : { num: null, text: '', type: 'empty' },
            right: j < adds.length
              ? { num: adds[j].newNum, text: adds[j].text, type: 'add' }
              : { num: null, text: '', type: 'empty' },
          });
        }
      }
    }
    return pairs;
  }
</script>

<div class="space-y-2">
  <div class="flex items-center gap-2">
    <span class="text-xs font-mono text-gray-400 flex-1 truncate">{diff.filePath}</span>
    <span class="text-xs text-green-500">+{diff.linesAdded}</span>
    <span class="text-xs text-red-400">-{diff.linesRemoved}</span>
    <button
      onclick={() => (mode = mode === 'unified' ? 'split' : 'unified')}
      class="text-xs px-2 py-1 bg-gray-800 border border-gray-700 rounded hover:bg-gray-700 text-gray-400"
    >
      {mode === 'unified' ? 'Split' : 'Unified'}
    </button>
  </div>

  <div class="rounded border border-gray-700 overflow-hidden">
    {#if mode === 'unified'}
      <table class="w-full text-xs font-mono border-collapse">
        <tbody>
          {#each lines as line}
            <tr class={lineRowClass(line.type)}>
              <td class="select-none text-right pr-2 pl-2 text-gray-600 w-10 align-top border-r border-gray-800">{line.oldNum ?? ''}</td>
              <td class="select-none text-right pr-2 pl-1 text-gray-600 w-10 align-top border-r border-gray-800">{line.newNum ?? ''}</td>
              <td class="pl-2 pr-3 whitespace-pre-wrap break-all">
                {#if line.type === 'hunk'}
                  <span class="text-blue-400">{line.text}</span>
                {:else}
                  <span class={linePrefixClass(line.type)}>{linePrefix(line.type)}</span>{line.text}
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    {:else}
      <table class="w-full text-xs font-mono border-collapse table-fixed">
        <tbody>
          {#each splitPairs as pair}
            <tr>
              <!-- Left side -->
              <td class="select-none text-right pr-2 pl-2 text-gray-600 w-10 align-top border-r border-gray-800 {splitCellBg(pair.left.type)}">{pair.left.num ?? ''}</td>
              <td class="pl-2 pr-1 whitespace-pre-wrap break-all w-[calc(50%-40px)] align-top border-r border-gray-700 {splitCellBg(pair.left.type)}">{pair.left.text}</td>
              <!-- Right side -->
              <td class="select-none text-right pr-2 pl-2 text-gray-600 w-10 align-top border-r border-gray-800 {splitCellBg(pair.right.type)}">{pair.right.num ?? ''}</td>
              <td class="pl-2 pr-1 whitespace-pre-wrap break-all align-top {splitCellBg(pair.right.type)}">{pair.right.text}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </div>
</div>

<script lang="ts" module>
  function lineRowClass(type: string): string {
    switch (type) {
      case 'add': return 'bg-green-950/40';
      case 'del': return 'bg-red-950/40';
      case 'hunk': return 'bg-blue-950/30';
      default: return '';
    }
  }

  function linePrefixClass(type: string): string {
    switch (type) {
      case 'add': return 'text-green-500';
      case 'del': return 'text-red-400';
      default: return 'text-gray-600';
    }
  }

  function linePrefix(type: string): string {
    switch (type) {
      case 'add': return '+';
      case 'del': return '-';
      default: return ' ';
    }
  }

  function splitCellBg(type: string): string {
    switch (type) {
      case 'add': return 'bg-green-950/40';
      case 'del': return 'bg-red-950/40';
      case 'empty': return 'bg-gray-900/50';
      case 'hunk': return 'bg-blue-950/30';
      default: return '';
    }
  }
</script>
