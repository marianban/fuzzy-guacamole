// @vitest-environment node

import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, describe, expect, it } from 'vitest';

import { buildServer } from '../http/server-app.js';
import { loadPresetCatalog } from './preset-catalog.js';

async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, JSON.stringify(value, null, 2), 'utf8');
}

describe('preset loading and routes', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(
      tempDirs.splice(0).map(async (dirPath) => {
        await rm(dirPath, { recursive: true, force: true });
      })
    );
  });

  it('given_valid_preset_bundle_when_loading_catalog_then_list_and_detail_are_available', async () => {
    const presetsRoot = await mkdtemp(path.join(tmpdir(), 'fg-presets-'));
    tempDirs.push(presetsRoot);
    const templateDir = path.join(presetsRoot, 'img2img-basic');
    await mkdir(templateDir, { recursive: true });

    await writeJsonFile(path.join(templateDir, 'preset.template.json'), {
      id: 'img2img-basic',
      type: 'img2img',
      workflow: {
        '12': {
          class_type: 'LoadImage',
          inputs: { image: '{{inputImagePath}}' }
        },
        '14': {
          class_type: 'PromptNode',
          inputs: { prompt: '{{prompt}}' }
        }
      }
    });

    await writeJsonFile(path.join(templateDir, 'basic.preset.json'), {
      id: 'img2img-basic/basic',
      name: 'Img2Img - Basic',
      type: 'img2img',
      defaults: {
        prompt: 'soft cinematic lighting',
        seedMode: 'random'
      }
    });

    await writeJsonFile(path.join(templateDir, 'model.json'), {
      categories: [
        {
          id: 'main',
          label: {
            en: 'Main'
          },
          order: 10,
          presentation: {
            collapsible: false,
            defaultExpanded: true
          }
        }
      ],
      fields: [
        {
          id: 'prompt',
          fieldType: 'string',
          categoryId: 'main',
          order: 10,
          label: {
            en: 'Prompt'
          },
          default: '',
          validation: {
            required: true,
            maxLength: 4000
          },
          control: {
            type: 'input',
            multiline: true,
            rows: 4
          }
        }
      ]
    });

    const catalog = await loadPresetCatalog({ presetsDir: presetsRoot });
    expect(catalog.list()).toEqual([
      {
        id: 'img2img-basic/basic',
        name: 'Img2Img - Basic',
        type: 'img2img',
        templateId: 'img2img-basic',
        templateFile: 'preset.template.json',
        defaults: {
          prompt: 'soft cinematic lighting',
          seedMode: 'random'
        }
      }
    ]);

    const app = buildServer({ presetCatalog: catalog });
    const listResponse = await app.inject({
      method: 'GET',
      url: '/api/presets'
    });
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json()).toHaveLength(1);

    const detailResponse = await app.inject({
      method: 'GET',
      url: '/api/presets/img2img-basic/basic'
    });
    expect(detailResponse.statusCode).toBe(200);
    expect(detailResponse.json()).toMatchObject({
      id: 'img2img-basic/basic',
      templateId: 'img2img-basic',
      model: {
        categories: [
          {
            id: 'main'
          }
        ],
        fields: [
          {
            id: 'prompt',
            fieldType: 'string'
          }
        ]
      },
      template: {
        id: 'img2img-basic',
        type: 'img2img'
      }
    });

    await app.close();
  });

  it('given_bundle_without_explicit_template_links_when_loading_catalog_then_template_metadata_is_derived_from_folder_convention', async () => {
    const presetsRoot = await mkdtemp(path.join(tmpdir(), 'fg-presets-'));
    tempDirs.push(presetsRoot);
    const templateDir = path.join(presetsRoot, 'img2img-basic');
    await mkdir(templateDir, { recursive: true });

    await writeJsonFile(path.join(templateDir, 'preset.template.json'), {
      id: 'img2img-basic',
      type: 'img2img',
      workflow: {
        '14': {
          class_type: 'PromptNode',
          inputs: { prompt: '{{prompt}}' }
        }
      }
    });

    await writeJsonFile(path.join(templateDir, 'basic.preset.json'), {
      id: 'img2img-basic/basic',
      name: 'Img2Img - Basic',
      type: 'img2img',
      defaults: {
        prompt: 'soft cinematic lighting',
        seedMode: 'random'
      }
    });

    await writeJsonFile(path.join(templateDir, 'model.json'), {
      categories: [
        {
          id: 'main',
          label: {
            en: 'Main'
          },
          order: 10,
          presentation: {
            collapsible: false,
            defaultExpanded: true
          }
        }
      ],
      fields: [
        {
          id: 'prompt',
          fieldType: 'string',
          categoryId: 'main',
          order: 10,
          label: {
            en: 'Prompt'
          },
          default: '',
          validation: {
            required: true,
            maxLength: 4000
          },
          control: {
            type: 'input',
            multiline: true,
            rows: 4
          }
        }
      ]
    });

    const catalog = await loadPresetCatalog({ presetsDir: presetsRoot });

    expect(catalog.list()).toEqual([
      {
        id: 'img2img-basic/basic',
        name: 'Img2Img - Basic',
        type: 'img2img',
        templateId: 'img2img-basic',
        templateFile: 'preset.template.json',
        defaults: {
          prompt: 'soft cinematic lighting',
          seedMode: 'random'
        }
      }
    ]);

    expect(catalog.getById('img2img-basic/basic')).toMatchObject({
      id: 'img2img-basic/basic',
      templateId: 'img2img-basic',
      templateFile: 'preset.template.json',
      model: {
        categories: [
          {
            id: 'main'
          }
        ],
        fields: [
          {
            id: 'prompt',
            fieldType: 'string'
          }
        ]
      },
      template: {
        id: 'img2img-basic',
        type: 'img2img'
      }
    });
  });

  it('given_template_type_mismatch_when_loading_catalog_then_loader_fails', async () => {
    const presetsRoot = await mkdtemp(path.join(tmpdir(), 'fg-presets-'));
    tempDirs.push(presetsRoot);
    const templateDir = path.join(presetsRoot, 'txt2img-basic');
    await mkdir(templateDir, { recursive: true });

    await writeJsonFile(path.join(templateDir, 'preset.template.json'), {
      id: 'txt2img-basic',
      type: 'txt2img',
      workflow: {}
    });

    await writeJsonFile(path.join(templateDir, 'basic.preset.json'), {
      id: 'txt2img-basic/basic',
      name: 'Broken preset',
      type: 'img2img',
      defaults: {}
    });

    await writeJsonFile(path.join(templateDir, 'model.json'), {
      categories: [
        {
          id: 'main',
          label: {
            en: 'Main'
          },
          order: 10,
          presentation: {
            collapsible: false,
            defaultExpanded: true
          }
        }
      ],
      fields: [
        {
          id: 'prompt',
          fieldType: 'string',
          categoryId: 'main',
          order: 10,
          label: {
            en: 'Prompt'
          },
          default: '',
          validation: {
            required: true
          },
          control: {
            type: 'input'
          }
        }
      ]
    });

    await expect(loadPresetCatalog({ presetsDir: presetsRoot })).rejects.toThrow(
      /Preset type mismatch/
    );
  });

  it('given_missing_model_file_when_loading_catalog_then_loader_fails', async () => {
    const presetsRoot = await mkdtemp(path.join(tmpdir(), 'fg-presets-'));
    tempDirs.push(presetsRoot);
    const templateDir = path.join(presetsRoot, 'img2img-basic');
    await mkdir(templateDir, { recursive: true });

    await writeJsonFile(path.join(templateDir, 'preset.template.json'), {
      id: 'img2img-basic',
      type: 'img2img',
      workflow: {}
    });

    await writeJsonFile(path.join(templateDir, 'basic.preset.json'), {
      id: 'img2img-basic/basic',
      name: 'Img2Img - Basic',
      type: 'img2img',
      defaults: {}
    });

    await expect(loadPresetCatalog({ presetsDir: presetsRoot })).rejects.toThrow(
      /model\.json/
    );
  });

  it('given_model_field_with_missing_category_when_loading_catalog_then_loader_fails', async () => {
    const presetsRoot = await mkdtemp(path.join(tmpdir(), 'fg-presets-'));
    tempDirs.push(presetsRoot);
    const templateDir = path.join(presetsRoot, 'img2img-basic');
    await mkdir(templateDir, { recursive: true });

    await writeJsonFile(path.join(templateDir, 'preset.template.json'), {
      id: 'img2img-basic',
      type: 'img2img',
      workflow: {
        '14': {
          class_type: 'PromptNode',
          inputs: { prompt: '{{prompt}}' }
        }
      }
    });

    await writeJsonFile(path.join(templateDir, 'basic.preset.json'), {
      id: 'img2img-basic/basic',
      name: 'Img2Img - Basic',
      type: 'img2img',
      defaults: {}
    });

    await writeJsonFile(path.join(templateDir, 'model.json'), {
      categories: [],
      fields: [
        {
          id: 'prompt',
          fieldType: 'string',
          categoryId: 'missing',
          order: 10,
          label: {
            en: 'Prompt'
          },
          default: '',
          validation: {
            required: true
          },
          control: {
            type: 'input'
          }
        }
      ]
    });

    await expect(loadPresetCatalog({ presetsDir: presetsRoot })).rejects.toThrow(
      /categoryId/
    );
  });

  it('given_model_field_without_category_when_loading_catalog_then_loader_succeeds', async () => {
    const presetsRoot = await mkdtemp(path.join(tmpdir(), 'fg-presets-'));
    tempDirs.push(presetsRoot);
    const templateDir = path.join(presetsRoot, 'img2img-basic');
    await mkdir(templateDir, { recursive: true });

    await writeJsonFile(path.join(templateDir, 'preset.template.json'), {
      id: 'img2img-basic',
      type: 'img2img',
      workflow: {
        '14': {
          class_type: 'PromptNode',
          inputs: { prompt: '{{prompt}}' }
        }
      }
    });

    await writeJsonFile(path.join(templateDir, 'basic.preset.json'), {
      id: 'img2img-basic/basic',
      name: 'Img2Img - Basic',
      type: 'img2img',
      defaults: {}
    });

    await writeJsonFile(path.join(templateDir, 'model.json'), {
      categories: [],
      fields: [
        {
          id: 'prompt',
          fieldType: 'string',
          order: 10,
          label: {
            en: 'Prompt'
          },
          default: '',
          validation: {
            required: true
          },
          control: {
            type: 'input'
          }
        }
      ]
    });

    const catalog = await loadPresetCatalog({ presetsDir: presetsRoot });

    expect(catalog.list()).toHaveLength(1);
    expect(catalog.getById('img2img-basic/basic')?.model.fields).toMatchObject([
      {
        id: 'prompt'
      }
    ]);
  });

  it('given_list_result_when_mutated_then_catalog_state_is_not_modified', async () => {
    const presetsRoot = await mkdtemp(path.join(tmpdir(), 'fg-presets-'));
    tempDirs.push(presetsRoot);
    const templateDir = path.join(presetsRoot, 'img2img-basic');
    await mkdir(templateDir, { recursive: true });

    await writeJsonFile(path.join(templateDir, 'preset.template.json'), {
      id: 'img2img-basic',
      type: 'img2img',
      workflow: {}
    });

    await writeJsonFile(path.join(templateDir, 'basic.preset.json'), {
      id: 'img2img-basic/basic',
      name: 'Img2Img - Basic',
      type: 'img2img',
      defaults: {}
    });

    await writeJsonFile(path.join(templateDir, 'model.json'), {
      categories: [
        {
          id: 'main',
          label: {
            en: 'Main'
          },
          order: 10,
          presentation: {
            collapsible: false,
            defaultExpanded: true
          }
        }
      ],
      fields: [
        {
          id: 'prompt',
          fieldType: 'string',
          categoryId: 'main',
          order: 10,
          label: {
            en: 'Prompt'
          },
          default: '',
          validation: {
            required: true
          },
          control: {
            type: 'input'
          }
        }
      ]
    });

    const catalog = await loadPresetCatalog({ presetsDir: presetsRoot });
    const firstList = catalog.list();
    firstList.splice(0, 1);

    expect(catalog.list()).toHaveLength(1);
  });
});
