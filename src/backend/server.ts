import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { projectsRouter } from './routes/projects.js';
import { sessionsRouter } from './routes/sessions.js';
import { historyRouter } from './routes/history.js';
import { statsRouter } from './routes/stats.js';
import { searchRouter } from './routes/search.js';
import { metaRouter } from './routes/meta.js';
import { filesRouter } from './routes/files.js';
import { startFileWatcher, subscribeToSession, findMostRecentSessionFile } from './services/file-watcher.js';
import { findSessionById } from './services/claude-data.js';
import { BACKEND_PORT } from '../shared/constants.js';

const app = express();

app.use(express.json());

// CORS for development
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', 'http://localhost:5173');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Mount routes
app.use('/api/projects', projectsRouter);
app.use('/api/sessions', sessionsRouter);
app.use('/api/history', historyRouter);
app.use('/api/stats', statsRouter);
app.use('/api/search', searchRouter);
app.use('/api/meta', metaRouter);
app.use('/api/files', filesRouter);

// Active session endpoint (for live monitor)
app.get('/api/live/active', async (req, res) => {
  try {
    const filePath = await findMostRecentSessionFile();
    if (!filePath) return res.json({ sessionId: null });
    const parts = filePath.split('/');
    const sessionFile = parts[parts.length - 1];
    const sessionId = sessionFile?.replace('.jsonl', '') ?? null;
    res.json({ sessionId, filePath });
  } catch (err) {
    res.status(500).json({ error: 'Failed to find active session' });
  }
});

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  const { join } = await import('path');
  const { fileURLToPath } = await import('url');
  const __dirname = fileURLToPath(new URL('.', import.meta.url));
  app.use(express.static(join(__dirname, '../../build')));
  app.get('*', (req, res) => {
    res.sendFile(join(__dirname, '../../build/index.html'));
  });
}

// HTTP server + WebSocket server
const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

// Track unsubscribe functions per WebSocket connection
const wsCleanup = new Map<WebSocket, (() => void)[]>();

wss.on('connection', (ws) => {
  console.log('[WS] Client connected');
  wsCleanup.set(ws, []);

  ws.on('message', async (data) => {
    try {
      const msg = JSON.parse(data.toString());

      if (msg.type === 'subscribe' && msg.sessionId) {
        const sessionId = msg.sessionId as string;
        console.log(`[WS] Subscribe to session: ${sessionId}`);

        const found = await findSessionById(sessionId);
        if (!found) {
          ws.send(JSON.stringify({ type: 'error', message: 'Session not found' }));
          return;
        }

        const unsubscribe = await subscribeToSession(found.filePath, (entries) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'session-update', sessionId, entries }));
          }
        });

        wsCleanup.get(ws)?.push(unsubscribe);
        ws.send(JSON.stringify({ type: 'subscribed', sessionId }));
      }

      if (msg.type === 'subscribe-active') {
        const filePath = await findMostRecentSessionFile();
        if (!filePath) {
          ws.send(JSON.stringify({ type: 'no-active-session' }));
          return;
        }
        const parts = filePath.split('/');
        const sessionId = parts[parts.length - 1]?.replace('.jsonl', '') ?? '';

        const unsubscribe = await subscribeToSession(filePath, (entries) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'session-update', sessionId, entries }));
          }
        });

        wsCleanup.get(ws)?.push(unsubscribe);
        ws.send(JSON.stringify({ type: 'active-session', sessionId }));
      }
    } catch (e) {
      console.error('[WS] Invalid message:', e);
    }
  });

  ws.on('close', () => {
    console.log('[WS] Client disconnected');
    const cleanups = wsCleanup.get(ws) ?? [];
    for (const fn of cleanups) fn();
    wsCleanup.delete(ws);
  });
});

// Start file watcher
startFileWatcher();

server.listen(BACKEND_PORT, () => {
  console.log(`[Backend] Server running at http://localhost:${BACKEND_PORT}`);
});
