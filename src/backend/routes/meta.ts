import { Router } from 'express';
import { getAllMeta, getSessionMeta, updateSessionMeta, getBudgets, updateBudgets } from '../services/session-meta.js';

export const metaRouter = Router();

// GET /api/meta - all metadata
metaRouter.get('/', async (req, res) => {
  try {
    res.json(await getAllMeta());
  } catch (err) {
    res.status(500).json({ error: 'Failed to read metadata' });
  }
});

// GET /api/meta/:sessionId
metaRouter.get('/:sessionId', async (req, res) => {
  try {
    const meta = await getSessionMeta(req.params.sessionId);
    res.json(meta ?? { sessionId: req.params.sessionId, bookmarked: false, tags: [], notes: '', updatedAt: '' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to read session metadata' });
  }
});

// PUT /api/meta/:sessionId
metaRouter.put('/:sessionId', async (req, res) => {
  try {
    const updated = await updateSessionMeta(req.params.sessionId, req.body);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update session metadata' });
  }
});

// GET /api/meta/budgets/current
metaRouter.get('/budgets/current', async (req, res) => {
  try {
    res.json(await getBudgets());
  } catch (err) {
    res.status(500).json({ error: 'Failed to read budgets' });
  }
});

// PUT /api/meta/budgets/current
metaRouter.put('/budgets/current', async (req, res) => {
  try {
    await updateBudgets(req.body);
    res.json(req.body);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update budgets' });
  }
});
