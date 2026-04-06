import type {
  PresetDefinition,
  PresetModel,
  WorkflowTemplate
} from '../shared/presets.js';

export interface ValidatePresetModelBundleOptions {
  templateDirName: string;
  templatePath: string;
  template: WorkflowTemplate;
  presetPath: string;
  preset: PresetDefinition;
  modelPath: string;
  model: PresetModel;
}

export function validatePresetModelBundle(
  options: ValidatePresetModelBundleOptions
): void {
  if (options.model.templateId !== options.template.id) {
    throw new Error(
      `Model templateId mismatch for ${options.modelPath}: expected "${options.template.id}" but got "${options.model.templateId}".`
    );
  }

  if (options.model.templateId !== options.templateDirName) {
    throw new Error(
      `Model templateId mismatch for ${options.modelPath}: expected folder "${options.templateDirName}" but got "${options.model.templateId}".`
    );
  }

  if (options.preset.type !== options.template.type) {
    throw new Error(
      `Preset type mismatch for ${options.presetPath}: preset "${options.preset.type}" does not match template "${options.template.type}".`
    );
  }

  const categoryIds = new Set<string>();
  for (const category of options.model.categories) {
    if (categoryIds.has(category.id)) {
      throw new Error(
        `Duplicate model category id "${category.id}" found in ${options.modelPath}.`
      );
    }
    categoryIds.add(category.id);
  }

  const fieldIds = new Set<string>();
  for (const field of options.model.fields) {
    if (fieldIds.has(field.id)) {
      throw new Error(
        `Duplicate model field id "${field.id}" found in ${options.modelPath}.`
      );
    }
    fieldIds.add(field.id);

    if (field.categoryId !== undefined && !categoryIds.has(field.categoryId)) {
      throw new Error(
        `Model field "${field.id}" in ${options.modelPath} has categoryId "${field.categoryId}" that does not reference an existing categoryId.`
      );
    }
  }

  for (const field of options.model.fields) {
    if (field.visibility !== undefined && !fieldIds.has(field.visibility.field)) {
      throw new Error(
        `Model field "${field.id}" in ${options.modelPath} has visibility.field "${field.visibility.field}" that does not reference an existing field id.`
      );
    }
  }
}
