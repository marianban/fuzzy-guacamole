import Fastify, { type FastifyInstance } from 'fastify';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import { z } from 'zod';
import {
  createJsonSchemaTransform,
  serializerCompiler,
  validatorCompiler
} from 'fastify-type-provider-zod';

import type { AppConfig } from './config.js';
import {
  type PresetCatalog,
  createEmptyPresetCatalog
} from './presets.js';
import { registerPresetRoutes } from './routes/presets.js';
import { registerStatusRoutes } from './routes/status.js';

export interface BuildServerOptions {
  stateSince?: string;
  config?: AppConfig;
  presetCatalog?: PresetCatalog;
}

export function buildServer(options: BuildServerOptions = {}): FastifyInstance {
  const app = Fastify({
    logger: true
  });
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  void app.register(fastifySwagger, {
    openapi: {
      openapi: '3.0.3',
      info: {
        title: 'Comfy Frontend Orchestrator API',
        version: '1.0.0'
      }
    },
    transform: createJsonSchemaTransform({
      skipList: ['/openapi', '/openapi/json', '/openapi/static/*']
    })
  });
  void app.register(fastifySwaggerUi, {
    routePrefix: '/openapi'
  });

  const stateSince = options.stateSince ?? new Date().toISOString();
  const presetCatalog = options.presetCatalog ?? createEmptyPresetCatalog();

  app.after(() => {
    app.get(
      '/healthz',
      {
        schema: {
          tags: ['system'],
          summary: 'Health check',
          response: {
            200: z.object({
              ok: z.literal(true)
            })
          }
        }
      },
      async () => ({ ok: true })
    );
    registerStatusRoutes(app, stateSince);
    registerPresetRoutes(app, presetCatalog);
  });

  return app;
}
