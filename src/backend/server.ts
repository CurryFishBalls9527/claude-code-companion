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
import { chatRouter, setChatSessionManager } from './routes/chat.js';
import { startFileWatcher, subscribeToSession, findMostRecentSessionFile } from './services/file-watcher.js';
import { findSessionById } from './services/claude-data.js';
import { SessionManager } from './services/session-manager.js';
import { BACKEND_PORT } from '../shared/constants.js';

const app = express();

app.use(express.json());

// CORS for development
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
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
app.use('/api/chat', chatRouter);

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

// ── Chat session manager ──────────────────────────────────────────────────────
// Map from chatSessionId → Set of WebSocket clients subscribed to it
const chatSubscriptions = new Map<string, Set<WebSocket>>();

const sessionManager = new SessionManager((sessionId, msg) => {
  const subs = chatSubscriptions.get(sessionId);
  if (!subs) return;
  const payload = JSON.stringify(msg);
  for (const ws of subs) {
    if (ws.readyState === WebSocket.OPEN) ws.send(payload);
  }
});
setChatSessionManager(sessionManager);

// ── WebSocket ─────────────────────────────────────────────────────────────────
// Track unsubscribe functions per WebSocket connection (for file-watcher subs)
const wsCleanup = new Map<WebSocket, (() => void)[]>();
// Track which chat sessions each WS is subscribed to
const wsChatSubs = new Map<WebSocket, Set<string>>();

wss.on('connection', (ws) => {
  console.log('[WS] Client connected');
  wsCleanup.set(ws, []);
  wsChatSubs.set(ws, new Set());

  ws.on('message', async (data) => {
    try {
      const msg = JSON.parse(data.toString());

      // ── Existing: live session replay ──
      if (msg.type === 'subscribe' && msg.sessionId) {
        const sessionId = msg.sessionId as string;
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

      // ── Chat (Agent SDK) ──
      if (msg.type === 'chat-create') {
        const { projectPath, model, resumeSessionId, permissionMode } = msg;
        if (!projectPath) {
          ws.send(JSON.stringify({ type: 'error', message: 'projectPath required' }));
          return;
        }
        try {
          console.log(`[WS] chat-create: projectPath=${projectPath} model=${model} permissionMode=${permissionMode}`);
          const sessionId = sessionManager.createSession({ projectPath, model, resumeSessionId, permissionMode });
          // Subscribe this WS to events from this chat session
          if (!chatSubscriptions.has(sessionId)) chatSubscriptions.set(sessionId, new Set());
          chatSubscriptions.get(sessionId)!.add(ws);
          wsChatSubs.get(ws)!.add(sessionId);
          console.log(`[WS] Sending chat-created for ${sessionId.slice(0, 8)}`);
          ws.send(JSON.stringify({ type: 'chat-created', sessionId }));
        } catch (e) {
          console.error(`[WS] chat-create FAILED:`, e instanceof Error ? e.message : String(e));
          ws.send(JSON.stringify({ type: 'error', message: e instanceof Error ? e.message : String(e) }));
        }
      }

      if (msg.type === 'chat-send') {
        sessionManager.sendMessage(msg.sessionId, msg.text);
      }

      if (msg.type === 'chat-approve') {
        sessionManager.approveToolUse(msg.sessionId, msg.toolId, msg.approved);
      }

      if (msg.type === 'chat-end') {
        sessionManager.endSession(msg.sessionId);
        chatSubscriptions.delete(msg.sessionId);
      }

    } catch (e) {
      console.error('[WS] Invalid message:', e);
    }
  });

  ws.on('close', () => {
    console.log('[WS] Client disconnected');
    // Clean up file-watcher subscriptions
    const cleanups = wsCleanup.get(ws) ?? [];
    for (const fn of cleanups) fn();
    wsCleanup.delete(ws);
    // Remove from chat subscriptions
    const chatSubs = wsChatSubs.get(ws) ?? new Set();
    for (const sessionId of chatSubs) {
      chatSubscriptions.get(sessionId)?.delete(ws);
    }
    wsChatSubs.delete(ws);
  });
});

// Start file watcher
startFileWatcher();

server.listen(BACKEND_PORT, () => {
  console.log(`[Backend] Server running at http://localhost:${BACKEND_PORT}`);
});
