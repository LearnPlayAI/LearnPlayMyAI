import { performanceMonitor } from './performanceMonitor';

export function createQueryLogger() {
  return {
    logQuery: (query: string, params?: any[], context?: string) => {
      const start = Date.now();
      
      return {
        end: () => {
          const duration = Date.now() - start;
          performanceMonitor.trackSlowQuery(query, duration, context);
        }
      };
    }
  };
}

export const queryLogger = createQueryLogger();
