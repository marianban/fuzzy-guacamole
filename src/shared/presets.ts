import { z } from 'zod';

const presetTypeSchema = z.enum(['img2img', 'txt2img']);

const localizedTextSchema = z
  .record(z.string().min(1), z.string())
  .refine(
    (value) => Object.keys(value).length > 0,
    'At least one localized value is required.'
  );

export const workflowTemplateSchema = z.object({
  id: z.string().min(1),
  type: presetTypeSchema,
  implicitRuntimeParamKeys: z.array(z.string().min(1)),
  workflow: z.record(z.string(), z.unknown())
});

export const presetDefinitionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: presetTypeSchema,
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

const presetModelCategorySchema = z.object({
  id: z.string().min(1),
  label: localizedTextSchema,
  order: z.number().int(),
  presentation: z.object({
    collapsible: z.boolean(),
    defaultExpanded: z.boolean()
  })
});

const presetModelSelectOptionSchema = z.object({
  value: z.string().min(1),
  label: localizedTextSchema
});

const presetModelControlSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('input'),
    multiline: z.boolean().optional(),
    rows: z.number().int().positive().optional(),
    inputMode: z.string().min(1).optional(),
    placeholder: localizedTextSchema.optional(),
    maxLength: z.number().int().positive().optional()
  }),
  z.object({
    type: z.literal('slider'),
    min: z.number(),
    max: z.number(),
    step: z.number().positive().optional()
  }),
  z.object({
    type: z.literal('range'),
    min: z.number(),
    max: z.number(),
    step: z.number().positive().optional()
  }),
  z.object({
    type: z.literal('select'),
    options: z.array(presetModelSelectOptionSchema).min(1)
  })
]);

const presetModelValidationSchema = z.object({
  required: z.boolean(),
  min: z.number().optional(),
  max: z.number().optional(),
  minLength: z.number().int().nonnegative().optional(),
  maxLength: z.number().int().nonnegative().optional(),
  pattern: z.string().min(1).optional()
});

const presetModelVisibilitySchema = z.object({
  field: z.string().min(1),
  equals: z.unknown()
});

export const presetModelFieldSchema = z
  .object({
    id: z.string().min(1),
    fieldType: z.enum(['string', 'integer', 'number', 'enum']),
    categoryId: z.string().min(1).optional(),
    order: z.number().int(),
    label: localizedTextSchema,
    description: localizedTextSchema.optional(),
    default: z.unknown().optional(),
    validation: presetModelValidationSchema,
    visibility: presetModelVisibilitySchema.optional(),
    control: presetModelControlSchema
  })
  .superRefine((field, context) => {
    if (field.fieldType === 'string') {
      if (field.default !== undefined && typeof field.default !== 'string') {
        context.addIssue({
          code: 'custom',
          message: `Field "${field.id}" default must be a string.`
        });
      }
      if (field.control.type !== 'input') {
        context.addIssue({
          code: 'custom',
          message: `Field "${field.id}" with fieldType "string" must use input control.`
        });
      }
    }

    if (field.fieldType === 'integer') {
      if (field.default !== undefined && !Number.isInteger(field.default)) {
        context.addIssue({
          code: 'custom',
          message: `Field "${field.id}" default must be an integer.`
        });
      }
      if (
        field.control.type !== 'input' &&
        field.control.type !== 'slider' &&
        field.control.type !== 'range'
      ) {
        context.addIssue({
          code: 'custom',
          message: `Field "${field.id}" with fieldType "integer" must use input, slider, or range control.`
        });
      }
    }

    if (field.fieldType === 'number') {
      if (
        field.default !== undefined &&
        (typeof field.default !== 'number' || Number.isNaN(field.default))
      ) {
        context.addIssue({
          code: 'custom',
          message: `Field "${field.id}" default must be a number.`
        });
      }
      if (
        field.control.type !== 'input' &&
        field.control.type !== 'slider' &&
        field.control.type !== 'range'
      ) {
        context.addIssue({
          code: 'custom',
          message: `Field "${field.id}" with fieldType "number" must use input, slider, or range control.`
        });
      }
    }

    if (field.fieldType === 'enum') {
      if (field.control.type !== 'select') {
        context.addIssue({
          code: 'custom',
          message: `Field "${field.id}" with fieldType "enum" must use select control.`
        });
      }
      if (field.default !== undefined && typeof field.default !== 'string') {
        context.addIssue({
          code: 'custom',
          message: `Field "${field.id}" default must be a string enum value.`
        });
      }
      if (
        field.default !== undefined &&
        field.control.type === 'select' &&
        !field.control.options.some((option) => option.value === field.default)
      ) {
        context.addIssue({
          code: 'custom',
          message: `Field "${field.id}" default must match one of the select option values.`
        });
      }
    }
  });

export const presetModelSchema = z.object({
  categories: z.array(presetModelCategorySchema),
  fields: z.array(presetModelFieldSchema)
});

export const presetDetailSchema = presetSummarySchema.extend({
  template: workflowTemplateSchema,
  model: presetModelSchema
});

export const presetListResponseSchema = z.array(presetSummarySchema);

export type PresetType = z.infer<typeof presetTypeSchema>;
export type WorkflowTemplate = z.infer<typeof workflowTemplateSchema>;
export type PresetDefinition = z.infer<typeof presetDefinitionSchema>;
export type PresetSummary = z.infer<typeof presetSummarySchema>;
export type PresetModelCategory = z.infer<typeof presetModelCategorySchema>;
export type PresetModelSelectOption = z.infer<typeof presetModelSelectOptionSchema>;
export type PresetModelControl = z.infer<typeof presetModelControlSchema>;
export type PresetModelValidation = z.infer<typeof presetModelValidationSchema>;
export type PresetModelVisibility = z.infer<typeof presetModelVisibilitySchema>;
export type PresetModelField = z.infer<typeof presetModelFieldSchema>;
export type PresetModel = z.infer<typeof presetModelSchema>;
export type PresetDetail = z.infer<typeof presetDetailSchema>;
