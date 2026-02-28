import { Router } from 'express';
import { discoverProjects } from '../services/claude-data.js';

export const projectsRouter = Router();

projectsRouter.get('/', async (req, res) => {
  try {
    const projects = await discoverProjects();
    res.json(projects);
  } catch (err) {
    console.error('[/api/projects]', err);
    res.status(500).json({ error: 'Failed to discover projects' });
  }
});
