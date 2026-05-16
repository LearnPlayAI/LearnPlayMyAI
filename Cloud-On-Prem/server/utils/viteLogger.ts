export type ViteLoggerLike<TOptions = any> = {
  error: (msg: string, options?: TOptions) => void;
};

export function createViteCustomLogger<TLogger extends ViteLoggerLike>(
  viteLogger: TLogger,
  exitProcess: (code: number) => never | void = process.exit,
): TLogger {
  return {
    ...viteLogger,
    error: (msg: string, options?: Parameters<TLogger["error"]>[1]) => {
      viteLogger.error(msg, options);
      if (process.env.LEARNPLAY_VITE_FATAL_ERRORS === "true") {
        exitProcess(1);
      }
    },
  };
}
