import { Router, Request, Response } from 'express';
import { isSuperAdmin, withSessionAuthMiddleware } from './sharedResources';
import { GammaThemeSyncService } from '../services/gammaThemeSyncService';
import { GammaImageStyleService } from '../services/gammaImageStyleService';
import { performanceMonitor } from '../monitoring/performanceMonitor';
import { getSystemTimezone } from '../utils/timezone';

const router = Router();

// Server time endpoint for client synchronization
router.get('/api/server-time', (req: Request, res: Response) => {
  const serverTime = Date.now();
  res.json({ 
    serverTime,
    timestamp: new Date(serverTime).toISOString(),
    timezone: getSystemTimezone()
  });
});

// Performance Monitoring Endpoints (SuperAdmin only)
router.get('/api/monitoring/metrics', isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const metrics = performanceMonitor.getMetrics();
    res.json(metrics);
  } catch (error) {
    console.error('Error fetching metrics:', error);
    res.status(500).json({ error: 'Failed to fetch metrics' });
  }
});

router.get('/api/monitoring/slow-endpoints', isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const slowest = performanceMonitor.getSlowestEndpoints(limit);
    res.json(slowest);
  } catch (error) {
    console.error('Error fetching slow endpoints:', error);
    res.status(500).json({ error: 'Failed to fetch slow endpoints' });
  }
});

router.get('/api/monitoring/slow-queries', isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const slowQueries = performanceMonitor.getSlowQueries(limit);
    res.json(slowQueries);
  } catch (error) {
    console.error('Error fetching slow queries:', error);
    res.status(500).json({ error: 'Failed to fetch slow queries' });
  }
});

router.post('/api/monitoring/reset', isSuperAdmin, async (req: Request, res: Response) => {
  try {
    performanceMonitor.reset();
    res.json({ message: 'Metrics reset successfully' });
  } catch (error) {
    console.error('Error resetting metrics:', error);
    res.status(500).json({ error: 'Failed to reset metrics' });
  }
});

// Get available Gamma themes from database
router.get('/api/gamma/themes', withSessionAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const search = req.query.search as string | undefined;
    const category = req.query.category as string | undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
    const offset = req.query.offset ? parseInt(req.query.offset as string) : undefined;
    
    const result = await GammaThemeSyncService.getActiveThemes(search, category, limit, offset);
    res.json(result);
  } catch (error) {
    console.error("[Gamma Themes] Error fetching themes:", error);
    res.status(500).json({ error: "Failed to fetch Gamma themes" });
  }
});

// Get available Gamma image styles from database
router.get('/api/gamma/image-styles', withSessionAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const search = req.query.search as string | undefined;
    const styles = await GammaImageStyleService.getActiveStyles(search);
    res.json({ styles });
  } catch (error) {
    console.error("[Gamma Image Styles] Error fetching styles:", error);
    res.status(500).json({ error: "Failed to fetch image styles" });
  }
});

// Get user notification center
router.get('/api/notifications', withSessionAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.session.user.id;
    const { limit = '50', offset = '0' } = req.query;

    const { NotificationService } = await import('../services/notificationService');

    const result = await NotificationService.getUserNotifications(
      userId,
      parseInt(limit as string),
      parseInt(offset as string)
    );

    res.json(result);
  } catch (error) {
    console.error('Error getting notifications:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// Mark notification as read
router.post('/api/notifications/:id/read', withSessionAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const { id: notificationId } = req.params;
    const userId = req.session.user.id;

    const { NotificationService } = await import('../services/notificationService');

    await NotificationService.markAsRead(notificationId, userId);

    res.json({ success: true, message: 'Notification marked as read' });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// Get unread notification count
router.get('/api/notifications/unread-count', withSessionAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.session.user.id;

    const { NotificationService } = await import('../services/notificationService');

    const count = await NotificationService.getUnreadCount(userId);

    res.json({ count });
  } catch (error) {
    console.error('Error getting unread count:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

export function createMiscRouter(): Router {
  return router;
}
