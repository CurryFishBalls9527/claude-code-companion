import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';

const CONFIG_PATH = join(homedir(), '.claude', 'companion-mcp.json');

export interface McpServerEntry {
  name: string;
  type: 'stdio' | 'sse' | 'http';
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
  enabled: boolean;
}

export function loadMcpServers(): McpServerEntry[] {
  if (!existsSync(CONFIG_PATH)) return [];
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
  } catch {
    return [];
  }
}

export function saveMcpServers(servers: McpServerEntry[]): void {
  const dir = dirname(CONFIG_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(servers, null, 2));
}

/**
 * Convert saved MCP servers to the format expected by the SDK queryOptions.mcpServers
 */
export function toSdkMcpServers(servers: McpServerEntry[]): Record<string, any> {
  const result: Record<string, any> = {};
  for (const s of servers) {
    if (!s.enabled) continue;
    if (s.type === 'stdio' && s.command) {
      result[s.name] = { type: 'stdio', command: s.command, args: s.args ?? [], env: s.env };
    } else if ((s.type === 'sse' || s.type === 'http') && s.url) {
      result[s.name] = { type: s.type, url: s.url, env: s.env };
    }
  }
  return result;
}
