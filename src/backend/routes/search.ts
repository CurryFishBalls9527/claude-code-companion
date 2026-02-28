import { Router } from 'express';
import { searchSessions } from '../services/search-index.js';

export const searchRouter = Router();

// GET /api/search?q=...&project=<hash>&limit=20
searchRouter.get('/', async (req, res) => {
  try {
    const { q = '', project, limit = '20' } = req.query as Record<string, string>;
    const results = await searchSessions(q, project || undefined, Number(limit));
    res.json(results);
  } catch (err) {
    console.error('[/api/search]', err);
    res.status(500).json({ error: 'Search failed' });
  }
});
