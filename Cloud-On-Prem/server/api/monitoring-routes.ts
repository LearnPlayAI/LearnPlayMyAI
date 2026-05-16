import { Router, type Request, type Response } from 'express';
import { performanceMonitor } from '../monitoring/performanceMonitor';

const router = Router();

// Middleware to check if user is SuperAdmin
const isSuperAdmin = async (req: Request, res: Response, next: any) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Authentication required" });
  }
  
  const { storage } = await import('../storage');
  const user = await storage.getUser(req.session.userId);
  
  if (!user?.isSuperAdmin) {
    return res.status(403).json({ error: "SuperAdmin access required" });
  }
  
  next();
};

// Get performance metrics (SuperAdmin only)
router.get('/api/monitoring/metrics', isSuperAdmin, async (req: Request, res: Response) => {
  try {
    const metrics = performanceMonitor.getMetrics();
    res.json(metrics);
  } catch (error) {
    console.error('Error fetching metrics:', error);
    res.status(500).json({ error: 'Failed to fetch metrics' });
  }
});

// Get slowest endpoints (SuperAdmin only)
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

// Get slow queries (SuperAdmin only)
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

// Reset metrics (SuperAdmin only)
router.post('/api/monitoring/reset', isSuperAdmin, async (req: Request, res: Response) => {
  try {
    performanceMonitor.reset();
    res.json({ message: 'Metrics reset successfully' });
  } catch (error) {
    console.error('Error resetting metrics:', error);
    res.status(500).json({ error: 'Failed to reset metrics' });
  }
});

export default router;
