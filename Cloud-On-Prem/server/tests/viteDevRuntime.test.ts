import { describe, expect, it, jest } from '@jest/globals';
import { createViteCustomLogger } from '../utils/viteLogger';

describe('Vite development runtime', () => {
  it('logs Vite transform errors without terminating the local app process', () => {
    const baseLogger = {
      error: jest.fn(),
    };
    const exit = jest.fn();

    const logger = createViteCustomLogger(baseLogger, exit);

    logger.error('Failed to parse JSON file.');

    expect(baseLogger.error).toHaveBeenCalledWith('Failed to parse JSON file.', undefined);
    expect(exit).not.toHaveBeenCalled();
  });
});
