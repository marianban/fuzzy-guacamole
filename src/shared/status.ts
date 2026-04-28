import { z } from 'zod';

const appStatusStateSchema = z.enum(['Offline', 'Starting', 'Online', 'StartupFailed']);

export const appStatusResponseSchema = z
  .object({
    state: appStatusStateSchema,
    since: z.iso.datetime(),
    lastError: z.string().optional(),
    comfy: z
      .object({
        comfyuiVersion: z.string().optional(),
        pytorchVersion: z.string().optional(),
        devices: z
          .array(
            z.object({
              name: z.string(),
              type: z.string(),
              vram_total: z.number().optional(),
              vram_free: z.number().optional()
            })
          )
          .optional()
      })
      .optional()
  })
  .superRefine((value, context) => {
    if (value.lastError !== undefined && value.state !== 'StartupFailed') {
      context.addIssue({
        code: 'custom',
        message: 'lastError is only valid when state is StartupFailed.',
        path: ['lastError']
      });
    }

    if (value.comfy !== undefined && value.state !== 'Online') {
      context.addIssue({
        code: 'custom',
        message: 'comfy details are only valid when state is Online.',
        path: ['comfy']
      });
    }
  });

export type AppStatusState = z.infer<typeof appStatusStateSchema>;
export type AppStatusResponse = z.infer<typeof appStatusResponseSchema>;
