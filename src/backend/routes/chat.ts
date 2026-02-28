import { Router } from 'express';
import type { SessionManager } from '../services/session-manager.js';

// sessionManager is injected from server.ts after construction
let _manager: SessionManager;
export function setChatSessionManager(m: SessionManager) { _manager = m; }

export const chatRouter = Router();

// GET /api/chat/sessions
chatRouter.get('/sessions', (_req, res) => {
  if (!_manager) return res.json([]);
  res.json(_manager.listSessions());
});

// POST /api/chat/sessions
chatRouter.post('/sessions', (req, res) => {
  if (!_manager) return res.status(503).json({ error: 'Session manager not ready' });
  const { projectPath, model, resumeSessionId, permissionMode } = req.body as {
    projectPath?: string;
    model?: string;
    resumeSessionId?: string;
    permissionMode?: string;
  };
  if (!projectPath) return res.status(400).json({ error: 'projectPath is required' });

  try {
    const sessionId = _manager.createSession({ projectPath, model, resumeSessionId, permissionMode });
    res.json({ sessionId });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

// GET /api/chat/sessions/:id
chatRouter.get('/sessions/:id', (req, res) => {
  if (!_manager) return res.status(503).json({ error: 'Session manager not ready' });
  const session = _manager.listSessions().find((s) => s.id === req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  res.json(session);
});

// DELETE /api/chat/sessions/:id
chatRouter.delete('/sessions/:id', (req, res) => {
  if (!_manager) return res.status(503).json({ error: 'Session manager not ready' });
  _manager.endSession(req.params.id);
  res.json({ ok: true });
});
