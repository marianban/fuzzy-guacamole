import { z } from 'zod';

import { generationSchema } from '../../../../shared/generations.js';

export const generationParamsSchema = z.object({
  generationId: z.uuid()
});

export const errorResponseSchema = z.object({
  message: z.string(),
  issues: z.array(z.string()).optional()
});

export const generationConflictResponseSchemas = {
  404: errorResponseSchema,
  409: errorResponseSchema
};

export const generationResponseSchemas = {
  200: generationSchema,
  ...generationConflictResponseSchemas
};

export const generationValidationResponseSchemas = {
  400: errorResponseSchema,
  ...generationResponseSchemas
};
