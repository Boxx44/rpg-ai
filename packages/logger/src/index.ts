import pino, { type Logger, type LoggerOptions } from 'pino';

/** Paths that must never appear in logs. */
export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'headers.authorization',
  '*.password',
  '*.token',
  '*.access_token',
  '*.refresh_token',
];

export function createLogger(name: string, opts: LoggerOptions = {}): Logger {
  return pino({
    name,
    level: process.env.LOG_LEVEL ?? 'info',
    redact: { paths: REDACT_PATHS, censor: '[redacted]' },
    base: { service: name },
    timestamp: pino.stdTimeFunctions.isoTime,
    ...opts,
  });
}

export type { Logger };
