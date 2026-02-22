import { z } from 'zod';

export const appStatusStateSchema = z.enum(['Starting', 'Online', 'Offline']);

export const appStatusResponseSchema = z.object({
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
});

export type AppStatusState = z.infer<typeof appStatusStateSchema>;
export type AppStatusResponse = z.infer<typeof appStatusResponseSchema>;
