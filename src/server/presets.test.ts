// @vitest-environment node

import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, describe, expect, it } from 'vitest';

import { buildServer } from './app.js';
import { loadPresetCatalog } from './presets.js';

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
      template: 'preset.template.json',
      defaults: {
        prompt: 'soft cinematic lighting',
        seedMode: 'random'
      }
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
      template: {
        id: 'img2img-basic',
        type: 'img2img'
      }
    });

    await app.close();
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
      template: 'preset.template.json',
      defaults: {}
    });

    await expect(loadPresetCatalog({ presetsDir: presetsRoot })).rejects.toThrow(
      /Preset type mismatch/
    );
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
      template: 'preset.template.json',
      defaults: {}
    });

    const catalog = await loadPresetCatalog({ presetsDir: presetsRoot });
    const firstList = catalog.list();
    firstList.splice(0, 1);

    expect(catalog.list()).toHaveLength(1);
  });
});
