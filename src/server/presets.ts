import type { Dirent } from 'node:fs';
import { readdir } from 'node:fs/promises';
import path from 'node:path';

import {
  type PresetDetail,
  type PresetSummary,
  presetDefinitionSchema,
  presetDetailSchema,
  workflowTemplateSchema
} from '../shared/presets.js';
import { loadPresetModel } from './preset-model-loader.js';
import { validatePresetModelBundle } from './preset-model-validator.js';
import { loadPresetJsonFile } from './preset-json-file.js';

interface LoadPresetCatalogOptions {
  presetsDir: string;
}

const TEMPLATE_FILE_NAME = 'preset.template.json';

export interface PresetCatalog {
  list(): PresetSummary[];
  getById(presetId: string): PresetDetail | undefined;
}

class InMemoryPresetCatalog implements PresetCatalog {
  readonly #summaries: PresetSummary[];
  readonly #detailsById: Map<string, PresetDetail>;

  constructor(summaries: PresetSummary[], detailsById: Map<string, PresetDetail>) {
    this.#summaries = summaries;
    this.#detailsById = detailsById;
  }

  list(): PresetSummary[] {
    return [...this.#summaries];
  }

  getById(presetId: string): PresetDetail | undefined {
    return this.#detailsById.get(presetId);
  }
}

export function createPresetCatalog(
  summaries: PresetSummary[],
  detailsById: Map<string, PresetDetail>
): PresetCatalog {
  return new InMemoryPresetCatalog(summaries, detailsById);
}

export function createEmptyPresetCatalog(): PresetCatalog {
  return new InMemoryPresetCatalog([], new Map<string, PresetDetail>());
}

export async function loadPresetCatalog(
  options: LoadPresetCatalogOptions
): Promise<PresetCatalog> {
  const templateDirs = await listTemplateDirectories(options.presetsDir);
  const summaries: PresetSummary[] = [];
  const detailsById = new Map<string, PresetDetail>();

  for (const templateDirName of templateDirs) {
    const templateDirPath = path.resolve(options.presetsDir, templateDirName);
    const templatePath = path.resolve(templateDirPath, TEMPLATE_FILE_NAME);
    const template = workflowTemplateSchema.parse(await loadPresetJsonFile(templatePath));

    if (template.id !== templateDirName) {
      throw new Error(
        `Template id mismatch for ${templatePath}: expected "${templateDirName}" but got "${template.id}".`
      );
    }

    const { model, modelPath } = await loadPresetModel({ templateDirPath });

    const directoryEntries = await readdir(templateDirPath, { withFileTypes: true });
    const presetFileNames = directoryEntries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.preset.json'))
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right));

    for (const presetFileName of presetFileNames) {
      const presetPath = path.resolve(templateDirPath, presetFileName);
      const preset = presetDefinitionSchema.parse(await loadPresetJsonFile(presetPath));

      assertPresetIdForTemplate(preset.id, templateDirName);
      validatePresetModelBundle({
        template,
        presetPath,
        preset,
        modelPath,
        model
      });

      const summary: PresetSummary = {
        id: preset.id,
        name: preset.name,
        type: preset.type,
        templateId: template.id,
        templateFile: TEMPLATE_FILE_NAME,
        defaults: preset.defaults
      };

      const detail = presetDetailSchema.parse({
        ...summary,
        template,
        model
      });

      if (detailsById.has(detail.id)) {
        throw new Error(`Duplicate preset id "${detail.id}" found in ${presetPath}.`);
      }

      summaries.push(summary);
      detailsById.set(detail.id, detail);
    }
  }

  return createPresetCatalog(
    summaries.sort((left, right) => left.id.localeCompare(right.id)),
    detailsById
  );
}

async function listTemplateDirectories(presetsDir: string): Promise<string[]> {
  let entries: Dirent[];
  try {
    entries = await readdir(presetsDir, {
      withFileTypes: true,
      encoding: 'utf8'
    });
  } catch (error) {
    throw new Error(
      `Failed to read presets directory ${presetsDir}: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
}

function assertPresetIdForTemplate(presetId: string, templateId: string): void {
  const segments = presetId.split('/');
  if (segments.length !== 2 || segments.some((segment) => segment.length === 0)) {
    throw new Error(
      `Preset id "${presetId}" is invalid. Expected format "{templateId}/{presetName}".`
    );
  }

  if (segments[0] !== templateId) {
    throw new Error(
      `Preset id "${presetId}" does not match template folder "${templateId}".`
    );
  }
}
