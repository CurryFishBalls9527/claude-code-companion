import type {
  ProjectInfo,
  SessionSummary,
  SessionDetail,
  FileDiff,
  DashboardStats,
  HistoryEntry,
  SearchResult,
  TopFile,
  ToolUsageStat,
  SessionMeta,
  DashboardMeta,
  CostBudget,
  ToolTiming,
  FileEdit,
} from '$shared/types.js';

// In Tauri the frontend is served from a custom protocol (tauri://), so
// relative /api paths won't reach the Express backend. Use the explicit port.
const isTauri = typeof window !== 'undefined' && '__TAURI__' in window;
const BASE = isTauri ? 'http://localhost:3456/api' : '/api';

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error: string }).error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

async function put<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error: string }).error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  // Projects
  getProjects(): Promise<ProjectInfo[]> {
    return get('/projects');
  },

  // Sessions
  getSessions(params?: {
    project?: string;
    limit?: number;
    offset?: number;
    sort?: 'date' | 'tokens' | 'messages';
  }): Promise<{ sessions: SessionSummary[]; total: number; offset: number; limit: number }> {
    const qs = new URLSearchParams();
    if (params?.project) qs.set('project', params.project);
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.offset) qs.set('offset', String(params.offset));
    if (params?.sort) qs.set('sort', params.sort);
    return get(`/sessions?${qs}`);
  },

  getSession(id: string): Promise<SessionDetail> {
    return get(`/sessions/${encodeURIComponent(id)}`);
  },

  getSessionDiffs(id: string): Promise<FileDiff[]> {
    return get(`/sessions/${encodeURIComponent(id)}/diffs`);
  },

  // History
  getHistory(params?: { limit?: number; project?: string }): Promise<HistoryEntry[]> {
    const qs = new URLSearchParams();
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.project) qs.set('project', params.project);
    return get(`/history?${qs}`);
  },

  // Stats
  getStats(): Promise<DashboardStats> {
    return get('/stats');
  },

  getTopFiles(limit?: number): Promise<TopFile[]> {
    return get(`/stats/top-files${limit ? `?limit=${limit}` : ''}`);
  },

  getToolUsage(): Promise<ToolUsageStat[]> {
    return get('/stats/tool-usage');
  },

  // Search
  search(q: string, params?: { project?: string; limit?: number }): Promise<SearchResult[]> {
    const qs = new URLSearchParams({ q });
    if (params?.project) qs.set('project', params.project);
    if (params?.limit) qs.set('limit', String(params.limit));
    return get(`/search?${qs}`);
  },

  // Live
  getActiveSession(): Promise<{ sessionId: string | null; filePath?: string }> {
    return get('/live/active');
  },

  // Session export
  getExportUrl(id: string, format: 'json' | 'markdown'): string {
    return `${BASE}/sessions/${encodeURIComponent(id)}/export?format=${format}`;
  },

  // Meta / bookmarks / tags / notes
  getAllMeta(): Promise<DashboardMeta> {
    return get('/meta');
  },
  getSessionMeta(id: string): Promise<SessionMeta> {
    return get(`/meta/${encodeURIComponent(id)}`);
  },
  updateSessionMeta(id: string, patch: Partial<SessionMeta>): Promise<SessionMeta> {
    return put(`/meta/${encodeURIComponent(id)}`, patch);
  },

  // Budgets
  getBudgets(): Promise<CostBudget> {
    return get('/meta/budgets/current');
  },
  updateBudgets(budgets: CostBudget): Promise<CostBudget> {
    return put('/meta/budgets/current', budgets);
  },

  // Tool timing
  getToolTiming(sessionId?: string): Promise<ToolTiming[]> {
    return get(`/stats/tool-timing${sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : ''}`);
  },

  // File timeline
  getFileTimeline(filePath: string): Promise<FileEdit[]> {
    return get(`/files/timeline?path=${encodeURIComponent(filePath)}`);
  },

  // MCP servers
  getMcpServers(): Promise<{ name: string; type: string; command?: string; args?: string[]; url?: string; env?: Record<string, string>; enabled: boolean }[]> {
    return get('/mcp/servers');
  },
  saveMcpServers(servers: { name: string; type: string; command?: string; args?: string[]; url?: string; env?: Record<string, string>; enabled: boolean }[]): Promise<{ ok: boolean }> {
    return put('/mcp/servers', servers);
  },
};
