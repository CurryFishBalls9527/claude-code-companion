import { Router } from 'express';
import { discoverProjects, discoverSessions, getSessionPath } from '../services/claude-data.js';
import { parseSessionDetail } from '../services/session-parser.js';
import { extractDiffs } from '../services/diff-extractor.js';
import type { FileEdit } from '../../shared/types.js';

export const filesRouter = Router();

// GET /api/files/timeline?path=<filePath>
filesRouter.get('/timeline', async (req, res) => {
  try {
    const filePath = String(req.query.path ?? '');
    if (!filePath) return res.status(400).json({ error: 'path parameter required' });

    const edits: FileEdit[] = [];
    const projects = await discoverProjects();

    for (const project of projects) {
      const sessions = await discoverSessions(project.hash);
      for (const sessionFile of sessions) {
        try {
          const sessionPath = getSessionPath(project.hash, sessionFile);
          const detail = await parseSessionDetail(sessionPath);

          const toolCallsWithTs = detail.messages
            .filter((m) => m.toolCalls?.length)
            .flatMap((m) => (m.toolCalls ?? []).map((tc) => ({ toolCall: tc, timestamp: m.timestamp })));

          const diffs = extractDiffs(detail.id, toolCallsWithTs).filter(
            (d) => d.filePath === filePath
          );

          for (const diff of diffs) {
            edits.push({
              sessionId: detail.id,
              projectName: project.name,
              timestamp: diff.timestamp,
              toolName: diff.toolName,
              unifiedDiff: diff.unifiedDiff,
              linesAdded: diff.linesAdded,
              linesRemoved: diff.linesRemoved,
            });
          }
        } catch {
          continue;
        }
      }
    }

    edits.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    res.json(edits);
  } catch (err) {
    res.status(500).json({ error: 'Failed to build file timeline' });
  }
});
