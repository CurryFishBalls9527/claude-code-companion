import { Router } from 'express';
import { discoverProjects, discoverSessions, getSessionPath, findSessionById } from '../services/claude-data.js';
import { parseSessionSummary, parseSessionDetail } from '../services/session-parser.js';
import { extractDiffs, extractToolCallsWithTimestamps } from '../services/diff-extractor.js';
import { summaryCache, detailCache } from '../services/cache.js';
import { sessionToMarkdown } from '../utils/session-export.js';

export const sessionsRouter = Router();

// GET /api/sessions?project=<hash>&limit=50&offset=0&sort=date
sessionsRouter.get('/', async (req, res) => {
  try {
    const { project, limit = '50', offset = '0', sort = 'date' } = req.query as Record<string, string>;

    const projects = await discoverProjects();
    const filteredProjects = project ? projects.filter((p) => p.hash === project) : projects;

    const summaries = [];
    for (const proj of filteredProjects) {
      const sessions = await discoverSessions(proj.hash);
      for (const sessionFile of sessions) {
        const filePath = getSessionPath(proj.hash, sessionFile);
        let summary = await summaryCache.get(filePath);
        if (!summary) {
          summary = await parseSessionSummary(filePath);
          await summaryCache.set(filePath, summary);
        }
        summaries.push(summary);
      }
    }

    // Sort
    if (sort === 'date') {
      summaries.sort((a, b) => b.lastTimestamp.localeCompare(a.lastTimestamp));
    } else if (sort === 'tokens') {
      summaries.sort(
        (a, b) =>
          b.tokenUsage.input_tokens + b.tokenUsage.output_tokens -
          (a.tokenUsage.input_tokens + a.tokenUsage.output_tokens)
      );
    } else if (sort === 'messages') {
      summaries.sort((a, b) => b.messageCount - a.messageCount);
    }

    const total = summaries.length;
    const paginated = summaries.slice(Number(offset), Number(offset) + Number(limit));

    res.json({ sessions: paginated, total, offset: Number(offset), limit: Number(limit) });
  } catch (err) {
    console.error('[/api/sessions]', err);
    res.status(500).json({ error: 'Failed to load sessions' });
  }
});

// GET /api/sessions/:id
sessionsRouter.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const found = await findSessionById(id);
    if (!found) {
      return res.status(404).json({ error: 'Session not found' });
    }

    let detail = await detailCache.get(found.filePath);
    if (!detail) {
      detail = await parseSessionDetail(found.filePath);
      await detailCache.set(found.filePath, detail);
    }

    res.json(detail);
  } catch (err) {
    console.error('[/api/sessions/:id]', err);
    res.status(500).json({ error: 'Failed to load session' });
  }
});

// GET /api/sessions/:id/export?format=json|markdown
sessionsRouter.get('/:id/export', async (req, res) => {
  try {
    const { id } = req.params;
    const format = String(req.query.format ?? 'json');
    const found = await findSessionById(id);
    if (!found) return res.status(404).json({ error: 'Session not found' });

    let detail = await detailCache.get(found.filePath);
    if (!detail) {
      detail = await parseSessionDetail(found.filePath);
      await detailCache.set(found.filePath, detail);
    }

    if (format === 'markdown') {
      res.setHeader('Content-Type', 'text/markdown');
      res.setHeader('Content-Disposition', `attachment; filename="session-${id.slice(0, 8)}.md"`);
      res.send(sessionToMarkdown(detail));
    } else {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="session-${id.slice(0, 8)}.json"`);
      res.json(detail);
    }
  } catch (err) {
    res.status(500).json({ error: 'Export failed' });
  }
});

// GET /api/sessions/:id/diffs
sessionsRouter.get('/:id/diffs', async (req, res) => {
  try {
    const { id } = req.params;
    const found = await findSessionById(id);
    if (!found) {
      return res.status(404).json({ error: 'Session not found' });
    }

    let detail = await detailCache.get(found.filePath);
    if (!detail) {
      detail = await parseSessionDetail(found.filePath);
      await detailCache.set(found.filePath, detail);
    }

    const toolCallsWithTs = extractToolCallsWithTimestamps(detail.messages);
    const diffs = extractDiffs(id, toolCallsWithTs);

    res.json(diffs);
  } catch (err) {
    console.error('[/api/sessions/:id/diffs]', err);
    res.status(500).json({ error: 'Failed to extract diffs' });
  }
});
