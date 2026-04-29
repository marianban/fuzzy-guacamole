import type { FastifyInstance } from 'fastify';

import { registerCancelGenerationRoute } from './generations/cancel-generation-route.js';
import { registerCreateGenerationRoute } from './generations/create-generation-route.js';
import { registerDeleteGenerationRoute } from './generations/delete-generation-route.js';
import { registerGetGenerationRoute } from './generations/get-generation-route.js';
import { registerListGenerationsRoute } from './generations/list-generations-route.js';
import { registerQueueGenerationRoute } from './generations/queue-generation-route.js';
import type { RegisterGenerationRoutesOptions } from './generations/route-types.js';
import { registerUpdateGenerationRoute } from './generations/update-generation-route.js';
import { registerUploadGenerationInputRoute } from './generations/upload-generation-input-route.js';

export type { RegisterGenerationRoutesOptions } from './generations/route-types.js';

export function registerGenerationRoutes(
  app: FastifyInstance,
  options: RegisterGenerationRoutesOptions
): void {
  registerListGenerationsRoute(app, options);
  registerGetGenerationRoute(app, options);
  registerCreateGenerationRoute(app, options);
  registerUpdateGenerationRoute(app, options);
  registerUploadGenerationInputRoute(app, options);
  registerQueueGenerationRoute(app, options);
  registerCancelGenerationRoute(app, options);
  registerDeleteGenerationRoute(app, options);
}
