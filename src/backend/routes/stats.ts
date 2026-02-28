import { Router } from 'express';
import { getDashboardStats, getTopFiles, getToolUsage } from '../services/stats-service.js';

export const statsRouter = Router();

// GET /api/stats
statsRouter.get('/', async (req, res) => {
  try {
    const stats = await getDashboardStats();
    res.json(stats);
  } catch (err) {
    console.error('[/api/stats]', err);
    res.status(500).json({ error: 'Failed to compute stats' });
  }
});

// GET /api/stats/top-files?limit=20
statsRouter.get('/top-files', async (req, res) => {
  try {
    const limit = Number(req.query.limit ?? 20);
    const topFiles = await getTopFiles(limit);
    res.json(topFiles);
  } catch (err) {
    console.error('[/api/stats/top-files]', err);
    res.status(500).json({ error: 'Failed to compute top files' });
  }
});

// GET /api/stats/tool-usage
statsRouter.get('/tool-usage', async (req, res) => {
  try {
    const toolUsage = await getToolUsage();
    res.json(toolUsage);
  } catch (err) {
    console.error('[/api/stats/tool-usage]', err);
    res.status(500).json({ error: 'Failed to compute tool usage' });
  }
});
