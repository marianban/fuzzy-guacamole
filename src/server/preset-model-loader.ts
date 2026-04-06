import path from 'node:path';

import { type PresetModel, presetModelSchema } from '../shared/presets.js';

import { loadPresetJsonFile } from './preset-json-file.js';

export interface LoadPresetModelOptions {
  templateDirPath: string;
}

export interface LoadedPresetModel {
  model: PresetModel;
  modelPath: string;
}

export async function loadPresetModel(
  options: LoadPresetModelOptions
): Promise<LoadedPresetModel> {
  const modelPath = path.resolve(options.templateDirPath, 'model.json');
  const model = presetModelSchema.parse(await loadPresetJsonFile(modelPath));

  return {
    model,
    modelPath
  };
}
