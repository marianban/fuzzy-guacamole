import { z } from 'zod';

export const presetTypeSchema = z.enum(['img2img', 'txt2img']);

export const workflowTemplateSchema = z.object({
  id: z.string().min(1),
  type: presetTypeSchema,
  workflow: z.record(z.string(), z.unknown())
});

export const presetDefinitionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: presetTypeSchema,
  template: z.string().min(1),
  defaults: z.record(z.string(), z.unknown())
});

export const presetSummarySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: presetTypeSchema,
  templateId: z.string().min(1),
  templateFile: z.string().min(1),
  defaults: z.record(z.string(), z.unknown())
});

export const presetDetailSchema = presetSummarySchema.extend({
  template: workflowTemplateSchema
});

export const presetListResponseSchema = z.array(presetSummarySchema);

export type PresetType = z.infer<typeof presetTypeSchema>;
export type WorkflowTemplate = z.infer<typeof workflowTemplateSchema>;
export type PresetDefinition = z.infer<typeof presetDefinitionSchema>;
export type PresetSummary = z.infer<typeof presetSummarySchema>;
export type PresetDetail = z.infer<typeof presetDetailSchema>;
