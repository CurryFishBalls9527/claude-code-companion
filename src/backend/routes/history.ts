import { Router } from 'express';
import { HISTORY_FILE } from '../../shared/constants.js';
import { readJsonlAll } from '../utils/jsonl-reader.js';
import type { HistoryEntry } from '../../shared/types.js';

export const historyRouter = Router();

// GET /api/history?limit=100&project=/path/to/project
historyRouter.get('/', async (req, res) => {
  try {
    const { limit = '100', project } = req.query as Record<string, string>;

    const raw = await readJsonlAll(HISTORY_FILE);

    // History entries have different shape than session entries
    const entries: HistoryEntry[] = raw
      .map((r) => ({
        display: (r as unknown as Record<string, unknown>).display as string ?? '',
        timestamp: typeof (r as unknown as Record<string, unknown>).timestamp === 'number'
          ? new Date((r as unknown as Record<string, unknown>).timestamp as number).toISOString()
          : String((r as unknown as Record<string, unknown>).timestamp ?? ''),
        project: (r as unknown as Record<string, unknown>).project as string ?? undefined,
        sessionId: (r as unknown as Record<string, unknown>).sessionId as string ?? undefined,
      }))
      .filter((e) => !project || e.project === project)
      .reverse()
      .slice(0, Number(limit));

    res.json(entries);
  } catch (err) {
    console.error('[/api/history]', err);
    res.status(500).json({ error: 'Failed to load history' });
  }
});
