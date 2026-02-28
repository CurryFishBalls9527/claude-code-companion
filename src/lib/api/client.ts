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
} from '$shared/types.js';

const BASE = '/api';

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
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
};
