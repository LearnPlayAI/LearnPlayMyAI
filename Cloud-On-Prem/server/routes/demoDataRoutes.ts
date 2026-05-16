// @ts-nocheck
import { Router, Request, Response } from 'express';
import { withSessionAuthMiddleware } from './sharedResources';
import { storage } from '../storage';
import { isOnPremMode } from '../featureFlags';
import { DemoDataService } from '../services/demoDataService';

const router = Router();

function getProtectedOrgIdsFromSession(req: Request): string[] {
  const contextOrgId = String((req as any)?.session?.context?.effectiveOrganizationId || '').trim();
  const sessionOrgId = String((req as any)?.session?.organizationId || '').trim();
  const userOrgId = String((req as any)?.session?.user?.organizationId || '').trim();
  return Array.from(new Set([contextOrgId, sessionOrgId, userOrgId].filter(Boolean)));
}

async function requireDemoDataRole(req: Request, res: Response, next: any) {
  if (!req.session?.userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const user = await storage.getUser(req.session.userId);
  if (!user) {
    return res.status(401).json({ error: 'User not found' });
  }

  const onprem = isOnPremMode();
  const hasAccess = onprem ? (user.isCustSuper || user.isSuperAdmin) : !!user.isSuperAdmin;
  if (!hasAccess) {
    return res.status(403).json({
      error: onprem
        ? 'CustSuper or SuperAdmin access required for on-prem demo data tools'
        : 'SuperAdmin access required for cloud demo data tools',
    });
  }

  (req as any).demoAccessUser = user;
  next();
}

async function requireDemoDataAccess(req: Request, res: Response, next: any) {
  const policy = await DemoDataService.getPolicy();
  if (!policy.enabled) {
    return res.status(403).json({
      error: 'Demo data tooling is disabled by policy.',
      policy,
    });
  }

  if (!policy.envAllowed) {
    return res.status(403).json({
      error:
        'Demo data tooling is blocked in this environment. Only cloud/onprem DEV or ACC are allowed; PRD is always blocked.',
      policy,
    });
  }

  next();
}

router.get('/overview', withSessionAuthMiddleware, requireDemoDataRole, async (_req: Request, res: Response) => {
  try {
    const data = await DemoDataService.getOverview();
    res.json(data);
  } catch (error: any) {
    console.error('[DemoData] Failed to fetch overview:', error);
    res.status(500).json({ error: 'Failed to fetch demo data overview' });
  }
});

router.post('/preview', withSessionAuthMiddleware, requireDemoDataRole, requireDemoDataAccess, async (req: Request, res: Response) => {
  try {
    const preview = DemoDataService.getGenerationPreview(req.body || {});
    res.json(preview);
  } catch (error: any) {
    console.error('[DemoData] Failed to build preview:', error);
    res.status(400).json({ error: error?.message || 'Failed to build generation preview' });
  }
});

router.get('/templates', withSessionAuthMiddleware, requireDemoDataRole, async (_req: Request, res: Response) => {
  try {
    const templates = await DemoDataService.getTemplates();
    res.json({ templates });
  } catch (error: any) {
    console.error('[DemoData] Failed to fetch templates:', error);
    res.status(500).json({ error: error?.message || 'Failed to fetch demo templates' });
  }
});

router.post('/templates', withSessionAuthMiddleware, requireDemoDataRole, async (req: Request, res: Response) => {
  try {
    const user = (req as any).demoAccessUser;
    const name = String(req.body?.name || '').trim();
    const description = req.body?.description ? String(req.body.description) : undefined;
    const config = req.body?.config || {};
    const templates = await DemoDataService.saveTemplate(name, config, user.id, description);
    res.json({ templates });
  } catch (error: any) {
    console.error('[DemoData] Failed to save template:', error);
    res.status(400).json({ error: error?.message || 'Failed to save demo template' });
  }
});

router.delete('/templates/:name', withSessionAuthMiddleware, requireDemoDataRole, async (req: Request, res: Response) => {
  try {
    const user = (req as any).demoAccessUser;
    const templates = await DemoDataService.deleteTemplate(req.params.name, user.id);
    res.json({ templates });
  } catch (error: any) {
    console.error('[DemoData] Failed to delete template:', error);
    res.status(400).json({ error: error?.message || 'Failed to delete demo template' });
  }
});

router.get('/policy', withSessionAuthMiddleware, requireDemoDataRole, async (_req: Request, res: Response) => {
  try {
    const policy = await DemoDataService.getPolicy();
    res.json({ policy });
  } catch (error: any) {
    console.error('[DemoData] Failed to fetch policy:', error);
    res.status(500).json({ error: error?.message || 'Failed to fetch demo policy' });
  }
});

router.put('/policy', withSessionAuthMiddleware, requireDemoDataRole, async (req: Request, res: Response) => {
  try {
    const modeRaw = String(req.body?.mode || '').trim().toLowerCase();
    const mode = modeRaw === 'enabled' || modeRaw === 'disabled' || modeRaw === 'auto' ? modeRaw : null;
    if (!mode) {
      return res.status(400).json({ error: 'mode must be one of: auto, enabled, disabled' });
    }
    const user = (req as any).demoAccessUser;
    const policy = await DemoDataService.setPolicyOverride(mode as any, user.id);
    res.json({ message: 'Demo policy updated', policy });
  } catch (error: any) {
    console.error('[DemoData] Failed to update policy:', error);
    res.status(400).json({ error: error?.message || 'Failed to update demo policy' });
  }
});

router.get('/jobs/:jobId', withSessionAuthMiddleware, requireDemoDataRole, async (req: Request, res: Response) => {
  try {
    const job = DemoDataService.getJob(req.params.jobId);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    res.json(job);
  } catch (error: any) {
    console.error('[DemoData] Failed to fetch job:', error);
    res.status(500).json({ error: 'Failed to fetch demo data job' });
  }
});

router.get('/backups', withSessionAuthMiddleware, requireDemoDataRole, requireDemoDataAccess, async (_req: Request, res: Response) => {
  try {
    const backups = await DemoDataService.getBackups();
    res.json({ backups });
  } catch (error: any) {
    console.error('[DemoData] Failed to fetch backups:', error);
    res.status(500).json({ error: error?.message || 'Failed to fetch backups' });
  }
});

router.post('/backups', withSessionAuthMiddleware, requireDemoDataRole, requireDemoDataAccess, async (req: Request, res: Response) => {
  try {
    const user = (req as any).demoAccessUser;
    const job = await DemoDataService.enqueue('backup', user.id, req.body || {});
    res.status(202).json({
      message: 'Database backup job queued',
      job,
    });
  } catch (error: any) {
    console.error('[DemoData] Backup enqueue failed:', error);
    res.status(400).json({ error: error?.message || 'Failed to queue backup job' });
  }
});

router.post('/backups/restore', withSessionAuthMiddleware, requireDemoDataRole, requireDemoDataAccess, async (req: Request, res: Response) => {
  try {
    if ((req.body?.confirmText || '').trim().toUpperCase() !== 'RESTORE') {
      return res.status(400).json({ error: 'Restore requires confirmText: RESTORE' });
    }
    const backupId = String(req.body?.backupId || '').trim();
    if (!backupId) {
      return res.status(400).json({ error: 'backupId is required' });
    }
    const user = (req as any).demoAccessUser;
    const job = await DemoDataService.enqueue('restore', user.id, { backupId });
    res.status(202).json({
      message: 'Database restore job queued',
      job,
    });
  } catch (error: any) {
    console.error('[DemoData] Restore enqueue failed:', error);
    res.status(400).json({ error: error?.message || 'Failed to queue restore job' });
  }
});

router.post('/generate', withSessionAuthMiddleware, requireDemoDataRole, requireDemoDataAccess, async (req: Request, res: Response) => {
  try {
    const user = (req as any).demoAccessUser;
    const job = await DemoDataService.enqueue('generate', user.id, req.body || {});
    res.status(202).json({
      message: 'Demo data generation job queued',
      job,
    });
  } catch (error: any) {
    console.error('[DemoData] Generate enqueue failed:', error);
    res.status(400).json({ error: error?.message || 'Failed to queue demo data generation job' });
  }
});

router.post('/reset', withSessionAuthMiddleware, requireDemoDataRole, requireDemoDataAccess, async (req: Request, res: Response) => {
  try {
    if ((req.body?.confirmText || '').trim().toUpperCase() !== 'DEMO') {
      return res.status(400).json({ error: 'Reset requires confirmText: DEMO' });
    }
    const user = (req as any).demoAccessUser;
    const protectedOrgIds = getProtectedOrgIdsFromSession(req);
    const job = await DemoDataService.enqueue('reset', user.id, {
      ...(req.body || {}),
      protectedOrgIds,
    });
    res.status(202).json({
      message: 'Demo data reset job queued',
      job,
    });
  } catch (error: any) {
    console.error('[DemoData] Reset enqueue failed:', error);
    res.status(400).json({ error: error?.message || 'Failed to queue demo data reset job' });
  }
});

router.post('/purge', withSessionAuthMiddleware, requireDemoDataRole, requireDemoDataAccess, async (req: Request, res: Response) => {
  try {
    if ((req.body?.confirmText || '').trim().toUpperCase() !== 'DEMO') {
      return res.status(400).json({ error: 'Purge requires confirmText: DEMO' });
    }
    const user = (req as any).demoAccessUser;
    const protectedOrgIds = getProtectedOrgIdsFromSession(req);
    const job = await DemoDataService.enqueue('purge', user.id, { protectedOrgIds });
    res.status(202).json({
      message: 'Demo data purge job queued',
      job,
    });
  } catch (error: any) {
    console.error('[DemoData] Purge enqueue failed:', error);
    res.status(400).json({ error: error?.message || 'Failed to queue demo data purge job' });
  }
});

export function registerDemoDataRoutes(app: any) {
  app.use('/api/admin/demo-data', router);
}
