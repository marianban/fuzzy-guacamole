import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import type { GenerationEventBus } from '../../generations/events.js';

export function registerEventRoutes(
  app: FastifyInstance,
  eventBus: GenerationEventBus
): void {
  app.withTypeProvider<ZodTypeProvider>().get(
    '/api/events/generations',
    {
      schema: {
        tags: ['events'],
        summary: 'Subscribe to live generation events (SSE)',
        response: {
          200: z.string()
        }
      }
    },
    async (request, reply) => {
      reply.raw.setHeader('Content-Type', 'text/event-stream');
      reply.raw.setHeader('Cache-Control', 'no-cache');
      reply.raw.setHeader('Connection', 'keep-alive');
      reply.raw.flushHeaders?.();
      reply.raw.write(': connected\n\n');

      const unsubscribe = eventBus.subscribe((event) => {
        reply.raw.write('event: generation\n');
        reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
      });

      const keepAlive = setInterval(() => {
        reply.raw.write(': keepalive\n\n');
      }, 15_000);

      request.raw.on('close', () => {
        clearInterval(keepAlive);
        unsubscribe();
      });

      return new Promise<void>((resolve) => {
        request.raw.on('close', () => {
          resolve();
        });
      });
    }
  );
}
