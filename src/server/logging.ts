import path from 'node:path';

import type { DestinationStream, LevelWithSilent, Logger } from 'pino';
import pino from 'pino';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

export interface ServerLoggerOptions {
  level?: LevelWithSilent;
  stream?: DestinationStream;
  filePath?: string;
  enableFileLogging?: boolean;
}

export function createServerLogger(
  options: ServerLoggerOptions = {}
): Logger {
  const level = options.level ?? resolveLogLevel();

  if (options.stream !== undefined) {
    return pino(createBaseLoggerOptions(level), options.stream);
  }

  if (shouldEnableFileLogging(options)) {
    return pino(
      createBaseLoggerOptions(level),
      pino.transport({
        targets: [
          {
            target: 'pino/file',
            options: {
              destination: 1
            }
          },
          {
            target: 'pino-pretty',
            options: {
              append: true,
              colorize: false,
              destination: resolveLogFilePath(options.filePath),
              errorProps: 'stack',
              ignore: 'pid,hostname',
              levelFirst: true,
              messageFormat: '{if reqId}[{reqId}] {end}{msg}',
              mkdir: true,
              singleLine: false,
              translateTime: 'SYS:yyyy-mm-dd HH:MM:ss.l'
            }
          }
        ]
      })
    );
  }

  return pino(createBaseLoggerOptions(level));
}

export function registerRequestLogging(app: FastifyInstance): void {
  app.addHook('onError', (request, reply, error, done) => {
    request.log.error(
      {
        ...buildRequestLogContext(request, reply),
        err: error
      },
      'request failed'
    );
    done();
  });

  app.addHook('onResponse', (request, reply, done) => {
    request.log.info(buildRequestLogContext(request, reply), 'request completed');
    done();
  });
}

function buildRequestLogContext(
  request: FastifyRequest,
  reply: FastifyReply
): Record<string, unknown> {
  const context: Record<string, unknown> = {
    method: request.method,
    route: request.routeOptions.url,
    statusCode: reply.statusCode,
    responseTimeMs: roundElapsedTime(reply.elapsedTime),
    url: request.raw.url
  };
  const params = summarizeRecord(request.params);
  const query = summarizeRecord(request.query);
  const body = summarizeRequestBody(request.body);

  if (params !== undefined) {
    context.params = params;
  }
  if (query !== undefined) {
    context.query = query;
  }
  if (body !== undefined) {
    context.body = body;
  }

  return context;
}

function summarizeRequestBody(body: unknown): Record<string, unknown> | undefined {
  if (!isRecord(body)) {
    return undefined;
  }

  const summary: Record<string, unknown> = {
    keys: Object.keys(body).sort()
  };

  if (typeof body.presetId === 'string') {
    summary.presetId = body.presetId;
  }

  if (isRecord(body.presetParams)) {
    summary.presetParamKeys = Object.keys(body.presetParams).sort();

    const references: Record<string, unknown> = {};
    for (const key of ['generationId', 'id', 'inputImagePath', 'promptId']) {
      const value = body.presetParams[key];
      if (
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean'
      ) {
        references[key] = value;
      }
    }

    if (Object.keys(references).length > 0) {
      summary.references = references;
    }
  }

  return summary;
}

function summarizeRecord(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const summaryEntries = Object.entries(value).flatMap(([key, entry]) => {
    if (
      typeof entry === 'string' ||
      typeof entry === 'number' ||
      typeof entry === 'boolean'
    ) {
      return [[key, entry]] as const;
    }

    return [];
  });

  if (summaryEntries.length === 0) {
    return undefined;
  }

  return Object.fromEntries(summaryEntries);
}

function resolveLogLevel(): LevelWithSilent {
  const rawValue = process.env.LOG_LEVEL;
  if (rawValue === undefined || rawValue.length === 0) {
    return 'info';
  }

  const normalized = rawValue.toLowerCase();
  switch (normalized) {
    case 'fatal':
    case 'error':
    case 'warn':
    case 'info':
    case 'debug':
    case 'trace':
    case 'silent':
      return normalized;
    default:
      return 'info';
  }
}

function resolveLogFilePath(configuredPath: string | undefined): string {
  return path.resolve(
    configuredPath ?? process.env.LOG_FILE_PATH ?? path.join('data', 'logs', 'backend.log')
  );
}

function shouldEnableFileLogging(options: ServerLoggerOptions): boolean {
  if (options.enableFileLogging !== undefined) {
    return options.enableFileLogging;
  }

  return process.env.VITEST === undefined;
}

function createBaseLoggerOptions(level: LevelWithSilent) {
  return {
    level,
    timestamp: pino.stdTimeFunctions.isoTime
  };
}

function roundElapsedTime(value: number): number {
  return Math.round(value * 100) / 100;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
