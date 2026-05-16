// @vitest-environment node

import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { generationTelemetrySources } from '../../shared/generation-telemetry.js';
import { buildServer } from '../http/server-app.js';
import { createPresetCatalog } from '../presets/preset-catalog.js';
import { createBuildServerOptions } from '../test-support/build-server-options.js';
import { createRuntimeStatusFixture } from '../test-support/comfy-fixtures.js';
import { buildMultipartPayload } from '../test-support/multipart-fixtures.js';
import { createBasicImg2ImgTestCatalog } from '../test-support/preset-catalog-fixtures.js';
import { loadTestConfig } from '../test-support/test-app-config.js';
import type { PresetDetail } from '../../shared/presets.js';
import { createGenerationStore } from './default-store.js';
import { createGenerationEventBus } from './events.js';
import type { GenerationStore } from './store.js';
import { createGenerationTelemetry, type GenerationTelemetry } from './telemetry.js';

function buildTestServer(options: Parameters<typeof createBuildServerOptions>[0]) {
  return buildServer(createBuildServerOptions(options));
}

function createSpyTelemetry(
  eventBus: ReturnType<typeof createGenerationEventBus>,
  now: () => Date = () => new Date()
): GenerationTelemetry & { clearRun: ReturnType<typeof vi.fn> } {
  const telemetry = createGenerationTelemetry({
    eventBus,
    now
  });
  const clearRun = vi.fn((generationId: string) => {
    telemetry.clearRun(generationId);
  });

  return {
    startRun: (generationId: string) => telemetry.startRun(generationId),
    publishMilestone: (options) => telemetry.publishMilestone(options),
    publishProgress: (options) => telemetry.publishProgress(options),
    publishLog: (options) => telemetry.publishLog(options),
    clearRun
  };
}

function createCatalog() {
  return createBasicImg2ImgTestCatalog({ includeStepsField: true });
}

function createCatalogRequiringInput() {
  const summary = {
    id: 'img2img-basic/basic',
    name: 'Img2Img - Basic',
    type: 'img2img' as const,
    templateId: 'img2img-basic',
    templateFile: 'preset.template.json',
    defaults: {
      prompt: 'default prompt'
    }
  };

  const detail = {
    ...summary,
    model: {
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
          fieldType: 'string' as const,
          categoryId: 'main',
          order: 10,
          label: {
            en: 'Prompt'
          },
          validation: {
            required: true,
            maxLength: 4000
          },
          control: {
            type: 'input' as const
          }
        },
        {
          id: 'steps',
          fieldType: 'integer' as const,
          categoryId: 'main',
          order: 20,
          label: {
            en: 'Steps'
          },
          default: 30,
          validation: {
            required: true,
            min: 1,
            max: 100
          },
          control: {
            type: 'slider' as const,
            min: 1,
            max: 100,
            step: 1
          }
        }
      ]
    },
    template: {
      id: 'img2img-basic',
      type: 'img2img' as const,
      implicitRuntimeParamKeys: ['inputImagePath'],
      workflow: {
        '1': {
          class_type: 'PromptNode',
          inputs: { prompt: '{{prompt}}' }
        },
        '12': {
          class_type: 'LoadImage',
          inputs: { image: '{{inputImagePath}}' }
        }
      }
    }
  };

  return createPresetCatalog([summary], new Map([[detail.id, detail]]));
}

function createCatalogWithSeed() {
  const summary = {
    id: 'txt2img-basic/basic',
    name: 'Txt2Img - Basic',
    type: 'txt2img' as const,
    templateId: 'txt2img-basic',
    templateFile: 'preset.template.json',
    defaults: {
      prompt: 'default prompt',
      steps: 30,
      seedMode: 'random'
    }
  };

  const detail = {
    ...summary,
    model: {
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
          fieldType: 'string' as const,
          categoryId: 'main',
          order: 10,
          label: {
            en: 'Prompt'
          },
          validation: {
            required: true,
            maxLength: 4000
          },
          control: {
            type: 'input' as const
          }
        },
        {
          id: 'steps',
          fieldType: 'integer' as const,
          categoryId: 'main',
          order: 20,
          label: {
            en: 'Steps'
          },
          default: 30,
          validation: {
            required: true,
            min: 1,
            max: 100
          },
          control: {
            type: 'slider' as const,
            min: 1,
            max: 100,
            step: 1
          }
        },
        {
          id: 'seedMode',
          fieldType: 'enum' as const,
          categoryId: 'main',
          order: 30,
          label: {
            en: 'Seed Mode'
          },
          default: 'random',
          validation: {
            required: true
          },
          control: {
            type: 'select' as const,
            options: [
              {
                value: 'random',
                label: {
                  en: 'Random'
                }
              },
              {
                value: 'fixed',
                label: {
                  en: 'Fixed'
                }
              }
            ]
          }
        },
        {
          id: 'seed',
          fieldType: 'integer' as const,
          categoryId: 'main',
          order: 40,
          label: {
            en: 'Seed'
          },
          validation: {
            required: false,
            min: 0
          },
          visibility: {
            field: 'seedMode',
            equals: 'fixed'
          },
          control: {
            type: 'input' as const,
            inputMode: 'numeric' as const
          }
        }
      ]
    },
    template: {
      id: 'txt2img-basic',
      type: 'txt2img' as const,
      implicitRuntimeParamKeys: [],
      workflow: {
        '3': {
          class_type: 'SaveImage',
          inputs: {
            filename_prefix: 'result'
          }
        },
        '7': {
          class_type: 'KSampler',
          inputs: {
            seed: '{{seed}}',
            steps: '{{steps}}'
          }
        },
        '14': {
          class_type: 'PromptNode',
          inputs: {
            prompt: '{{prompt}}'
          }
        }
      }
    }
  };

  return createPresetCatalog([summary], new Map([[detail.id, detail]]));
}

function createCatalogWithBasicAndSeed() {
  const basicSummary = {
    id: 'img2img-basic/basic',
    name: 'Img2Img - Basic',
    type: 'img2img' as const,
    templateId: 'img2img-basic',
    templateFile: 'preset.template.json',
    defaults: {
      prompt: 'default prompt'
    }
  };
  const seedSummary = {
    id: 'txt2img-basic/basic',
    name: 'Txt2Img - Basic',
    type: 'txt2img' as const,
    templateId: 'txt2img-basic',
    templateFile: 'preset.template.json',
    defaults: {
      prompt: 'seed default prompt',
      steps: 12,
      seedMode: 'random'
    }
  };

  const basicDetail: PresetDetail = {
    ...basicSummary,
    model: createBasicModel(),
    template: {
      id: 'img2img-basic',
      type: 'img2img' as const,
      implicitRuntimeParamKeys: [],
      workflow: {
        '1': {
          class_type: 'PromptNode',
          inputs: { prompt: '{{prompt}}' }
        }
      }
    }
  };
  const seedDetail: PresetDetail = {
    ...seedSummary,
    model: createSeedModel(),
    template: {
      id: 'txt2img-basic',
      type: 'txt2img' as const,
      implicitRuntimeParamKeys: [],
      workflow: {
        '7': {
          class_type: 'KSampler',
          inputs: {
            seed: '{{seed}}',
            steps: '{{steps}}'
          }
        }
      }
    }
  };

  return createPresetCatalog(
    [basicSummary, seedSummary],
    new Map([
      [basicDetail.id, basicDetail],
      [seedDetail.id, seedDetail]
    ])
  );
}

function createBasicModel() {
  return {
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
        fieldType: 'string' as const,
        categoryId: 'main',
        order: 10,
        label: {
          en: 'Prompt'
        },
        default: 'default prompt',
        validation: {
          required: true,
          maxLength: 4000
        },
        control: {
          type: 'input' as const,
          multiline: true,
          rows: 4
        }
      },
      {
        id: 'steps',
        fieldType: 'integer' as const,
        categoryId: 'main',
        order: 20,
        label: {
          en: 'Steps'
        },
        default: 30,
        validation: {
          required: true,
          min: 1,
          max: 100
        },
        control: {
          type: 'slider' as const,
          min: 1,
          max: 100,
          step: 1
        }
      }
    ]
  };
}

function createSeedModel() {
  return {
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
        fieldType: 'string' as const,
        categoryId: 'main',
        order: 10,
        label: {
          en: 'Prompt'
        },
        validation: {
          required: true,
          maxLength: 4000
        },
        control: {
          type: 'input' as const
        }
      },
      {
        id: 'steps',
        fieldType: 'integer' as const,
        categoryId: 'main',
        order: 20,
        label: {
          en: 'Steps'
        },
        default: 12,
        validation: {
          required: true,
          min: 1,
          max: 20
        },
        control: {
          type: 'slider' as const,
          min: 1,
          max: 20,
          step: 1
        }
      },
      {
        id: 'seedMode',
        fieldType: 'enum' as const,
        categoryId: 'main',
        order: 30,
        label: {
          en: 'Seed Mode'
        },
        default: 'random',
        validation: {
          required: true
        },
        control: {
          type: 'select' as const,
          options: [
            {
              value: 'random',
              label: {
                en: 'Random'
              }
            },
            {
              value: 'fixed',
              label: {
                en: 'Fixed'
              }
            }
          ]
        }
      }
    ]
  };
}

describe('generation routes', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(
      tempDirs.splice(0).map(async (dirPath) => {
        await rm(dirPath, { recursive: true, force: true });
      })
    );
  });

  it('given_created_generation_when_listing_and_loading_detail_then_generation_is_returned', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'fg-gen-'));
    tempDirs.push(root);
    await mkdir(root, { recursive: true });
    const config = await loadTestConfig(root);

    const app = buildTestServer({
      config,
      presetCatalog: createCatalog()
    });

    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/generations',
      payload: {
        presetId: 'img2img-basic/basic',
        presetParams: {
          prompt: 'hello'
        }
      }
    });

    expect(createResponse.statusCode).toBe(201);
    const created = createResponse.json() as {
      id: string;
      status: string;
      presetId: string;
      templateId: string;
      queuedAt: string | null;
    };
    expect(created.status).toBe('draft');
    expect(created.presetId).toBe('img2img-basic/basic');
    expect(created.templateId).toBe('img2img-basic');
    expect(created.queuedAt).toBeNull();

    const listResponse = await app.inject({
      method: 'GET',
      url: '/api/generations'
    });
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json()).toHaveLength(1);

    const detailResponse = await app.inject({
      method: 'GET',
      url: `/api/generations/${created.id}`
    });
    expect(detailResponse.statusCode).toBe(200);
    expect(detailResponse.json()).toMatchObject({
      id: created.id,
      status: 'draft'
    });

    await app.close();
  });

  it('given_empty_preset_params_when_creating_generation_then_defaults_are_persisted_and_returned', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'fg-gen-'));
    tempDirs.push(root);
    await mkdir(root, { recursive: true });
    const config = await loadTestConfig(root);

    const app = buildTestServer({
      config,
      presetCatalog: createCatalog()
    });

    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/generations',
      payload: {
        presetId: 'img2img-basic/basic',
        presetParams: {}
      }
    });

    expect(createResponse.statusCode).toBe(201);
    const created = createResponse.json() as {
      id: string;
      presetParams: Record<string, unknown>;
    };
    expect(created.presetParams).toMatchObject({
      prompt: 'default prompt',
      steps: 30
    });

    const detailResponse = await app.inject({
      method: 'GET',
      url: `/api/generations/${created.id}`
    });

    expect(detailResponse.statusCode).toBe(200);
    expect(detailResponse.json()).toMatchObject({
      id: created.id,
      presetParams: {
        prompt: 'default prompt',
        steps: 30
      }
    });

    await app.close();
  });

  it('given_draft_generation_when_patch_switches_preset_then_old_params_are_cleared_and_new_defaults_apply', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'fg-gen-'));
    tempDirs.push(root);
    await mkdir(root, { recursive: true });
    const config = await loadTestConfig(root);

    const app = buildTestServer({
      config,
      presetCatalog: createCatalogWithBasicAndSeed()
    });

    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/generations',
      payload: {
        presetId: 'img2img-basic/basic',
        presetParams: {
          prompt: 'old prompt',
          steps: 40
        }
      }
    });
    const created = createResponse.json() as { id: string };

    const patchResponse = await app.inject({
      method: 'PATCH',
      url: `/api/generations/${created.id}`,
      payload: {
        presetId: 'txt2img-basic/basic',
        presetParams: {}
      }
    });

    expect(patchResponse.statusCode).toBe(200);
    expect(patchResponse.json()).toMatchObject({
      id: created.id,
      presetId: 'txt2img-basic/basic',
      templateId: 'txt2img-basic',
      presetParams: {
        prompt: 'seed default prompt',
        steps: 12,
        seedMode: 'random'
      }
    });

    await app.close();
  });

  it('given_invalid_patch_params_when_updating_generation_then_request_is_rejected', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'fg-gen-'));
    tempDirs.push(root);
    await mkdir(root, { recursive: true });
    const config = await loadTestConfig(root);

    const app = buildTestServer({
      config,
      presetCatalog: createCatalogWithBasicAndSeed()
    });

    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/generations',
      payload: {
        presetId: 'img2img-basic/basic',
        presetParams: {}
      }
    });
    const created = createResponse.json() as { id: string };

    const patchResponse = await app.inject({
      method: 'PATCH',
      url: `/api/generations/${created.id}`,
      payload: {
        presetId: 'txt2img-basic/basic',
        presetParams: {
          steps: 99
        }
      }
    });

    expect(patchResponse.statusCode).toBe(400);
    expect(patchResponse.json()).toMatchObject({
      message: expect.stringMatching(/steps/i)
    });

    await app.close();
  });

  it('given_terminal_generation_when_patched_then_params_update_before_requeue', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'fg-gen-'));
    tempDirs.push(root);
    await mkdir(root, { recursive: true });
    const config = await loadTestConfig(root);
    const store = createGenerationStore();

    for (const status of ['completed', 'failed', 'canceled'] as const) {
      const generation = await store.create({
        presetId: 'img2img-basic/basic',
        templateId: 'img2img-basic',
        presetParams: {
          prompt: `${status} old`
        }
      });
      await store.save({
        ...generation,
        status,
        updatedAt: '2026-04-07T10:00:00.000Z'
      });
    }

    const app = buildTestServer({
      config,
      presetCatalog: createCatalog(),
      generationStore: store
    });

    const generations = await store.list();
    for (const generation of generations) {
      const patchResponse = await app.inject({
        method: 'PATCH',
        url: `/api/generations/${generation.id}`,
        payload: {
          presetId: 'img2img-basic/basic',
          presetParams: {
            prompt: `${generation.status} patched`
          }
        }
      });

      expect(patchResponse.statusCode).toBe(200);
      expect(patchResponse.json()).toMatchObject({
        id: generation.id,
        status: generation.status,
        presetParams: {
          prompt: `${generation.status} patched`,
          steps: 30
        }
      });
    }

    await app.close();
  });

  it('given_active_generation_when_patched_then_conflict_is_returned', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'fg-gen-'));
    tempDirs.push(root);
    await mkdir(root, { recursive: true });
    const config = await loadTestConfig(root);
    const store = createGenerationStore();

    for (const status of ['queued', 'submitted'] as const) {
      const generation = await store.create({
        presetId: 'img2img-basic/basic',
        templateId: 'img2img-basic',
        presetParams: {
          prompt: `${status} old`
        }
      });
      await store.save({
        ...generation,
        status,
        updatedAt: '2026-04-07T10:00:00.000Z'
      });
    }

    const app = buildTestServer({
      config,
      presetCatalog: createCatalog(),
      generationStore: store
    });

    const generations = await store.list();
    for (const generation of generations) {
      const patchResponse = await app.inject({
        method: 'PATCH',
        url: `/api/generations/${generation.id}`,
        payload: {
          presetId: 'img2img-basic/basic',
          presetParams: {
            prompt: 'patched'
          }
        }
      });

      expect(patchResponse.statusCode).toBe(409);
    }

    await app.close();
  });

  it('given_generation_becomes_active_during_patch_when_updating_then_conflict_names_current_status', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'fg-gen-'));
    tempDirs.push(root);
    await mkdir(root, { recursive: true });
    const config = await loadTestConfig(root);
    const baseStore = createGenerationStore();
    const generation = await baseStore.create({
      presetId: 'img2img-basic/basic',
      templateId: 'img2img-basic',
      presetParams: {
        prompt: 'racing'
      }
    });

    const racingStore: GenerationStore = {
      create: (input) => baseStore.create(input),
      list: () => baseStore.list(),
      getById: (generationId) => baseStore.getById(generationId),
      getStoredById: (generationId) => baseStore.getStoredById(generationId),
      save: (input) => baseStore.save(input),
      delete: (generationId) => baseStore.delete(generationId),
      deleteDeletable: (generationId) => baseStore.deleteDeletable(generationId),
      setInputImagePath: (generationId, inputImagePath) =>
        baseStore.setInputImagePath(generationId, inputImagePath),
      async updateEditableGeneration(generationId, input) {
        await baseStore.save({
          ...generation,
          status: 'submitted',
          updatedAt: '2026-04-07T10:00:00.000Z'
        });
        return baseStore.updateEditableGeneration(generationId, input);
      },
      markQueued: (generationId, options) => baseStore.markQueued(generationId, options),
      claimNextQueued: () => baseStore.claimNextQueued(),
      recordPromptRequest: (generationId, promptRequest) =>
        baseStore.recordPromptRequest(generationId, promptRequest),
      recordPromptResponse: (generationId, promptResponse) =>
        baseStore.recordPromptResponse(generationId, promptResponse),
      markCanceled: (generationId) => baseStore.markCanceled(generationId),
      markCompleted: (generationId) => baseStore.markCompleted(generationId),
      markFailed: (generationId, error) => baseStore.markFailed(generationId, error),
      failSubmittedOnStartup: (error) => baseStore.failSubmittedOnStartup(error),
      failStaleSubmittedBefore: (staleBefore, error) =>
        baseStore.failStaleSubmittedBefore(staleBefore, error)
    };

    const app = buildTestServer({
      config,
      presetCatalog: createCatalog(),
      generationStore: racingStore
    });

    const patchResponse = await app.inject({
      method: 'PATCH',
      url: `/api/generations/${generation.id}`,
      payload: {
        presetId: 'img2img-basic/basic',
        presetParams: {
          prompt: 'patched'
        }
      }
    });

    expect(patchResponse.statusCode).toBe(409);
    expect(patchResponse.json()).toMatchObject({
      message: `Generation "${generation.id}" cannot be updated in status "submitted".`
    });

    await app.close();
  });

  it('given_missing_generation_when_patched_then_not_found_is_returned', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'fg-gen-'));
    tempDirs.push(root);
    await mkdir(root, { recursive: true });
    const config = await loadTestConfig(root);

    const app = buildTestServer({
      config,
      presetCatalog: createCatalog()
    });

    const patchResponse = await app.inject({
      method: 'PATCH',
      url: '/api/generations/11111111-1111-4111-8111-111111111111',
      payload: {
        presetId: 'img2img-basic/basic',
        presetParams: {
          prompt: 'patched'
        }
      }
    });

    expect(patchResponse.statusCode).toBe(404);

    await app.close();
  });

  it('given_missing_preset_when_patching_generation_then_not_found_is_returned', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'fg-gen-'));
    tempDirs.push(root);
    await mkdir(root, { recursive: true });
    const config = await loadTestConfig(root);

    const app = buildTestServer({
      config,
      presetCatalog: createCatalog()
    });

    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/generations',
      payload: {
        presetId: 'img2img-basic/basic',
        presetParams: {}
      }
    });
    const created = createResponse.json() as { id: string };

    const patchResponse = await app.inject({
      method: 'PATCH',
      url: `/api/generations/${created.id}`,
      payload: {
        presetId: 'missing/basic',
        presetParams: {}
      }
    });

    expect(patchResponse.statusCode).toBe(404);
    expect(patchResponse.json()).toMatchObject({
      message: 'Preset "missing/basic" was not found.'
    });

    await app.close();
  });

  it('given_same_preset_patch_after_input_upload_then_runtime_input_path_is_preserved', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'fg-gen-'));
    tempDirs.push(root);
    await mkdir(root, { recursive: true });
    const config = await loadTestConfig(root);

    const app = buildTestServer({
      config,
      presetCatalog: createCatalogRequiringInput()
    });

    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/generations',
      payload: {
        presetId: 'img2img-basic/basic',
        presetParams: {
          prompt: 'with input'
        }
      }
    });
    const created = createResponse.json() as { id: string };

    const fileBuffer = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const multipart = buildMultipartPayload('input.png', fileBuffer);
    const uploadResponse = await app.inject({
      method: 'POST',
      url: `/api/generations/${created.id}/input`,
      headers: {
        'content-type': `multipart/form-data; boundary=${multipart.boundary}`
      },
      payload: multipart.payload
    });
    expect(uploadResponse.statusCode).toBe(204);

    const beforePatchResponse = await app.inject({
      method: 'GET',
      url: `/api/generations/${created.id}`
    });
    const inputImagePath = (
      beforePatchResponse.json() as {
        presetParams: { inputImagePath: string };
      }
    ).presetParams.inputImagePath;

    const patchResponse = await app.inject({
      method: 'PATCH',
      url: `/api/generations/${created.id}`,
      payload: {
        presetId: 'img2img-basic/basic',
        presetParams: {
          prompt: 'patched input'
        }
      }
    });

    expect(patchResponse.statusCode).toBe(200);
    expect(patchResponse.json()).toMatchObject({
      presetParams: {
        prompt: 'patched input',
        steps: 30,
        inputImagePath
      }
    });

    await app.close();
  });

  it('given_draft_generation_when_queued_then_status_and_queue_time_are_set', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'fg-gen-'));
    tempDirs.push(root);
    await mkdir(root, { recursive: true });
    const config = await loadTestConfig(root);
    const eventBus = createGenerationEventBus();
    const telemetryEvents: {
      runId: string;
      sequence: number;
      source: string;
      status?: string;
      step?: string;
    }[] = [];

    const app = buildTestServer({
      config,
      presetCatalog: createCatalog(),
      generationEventBus: eventBus,
      runtimeStatus: createRuntimeStatusFixture('Online')
    });

    const unsubscribe = eventBus.subscribe((event) => {
      if (event.type !== 'telemetry') {
        return;
      }

      if (event.telemetry.kind === 'log') {
        return;
      }

      telemetryEvents.push({
        runId: event.runId,
        sequence: event.sequence,
        source: event.telemetry.source,
        ...(event.telemetry.kind === 'progress'
          ? { step: event.telemetry.step }
          : event.telemetry.kind === 'milestone'
            ? {
                ...(event.telemetry.status !== undefined
                  ? { status: event.telemetry.status }
                  : {}),
                ...(event.telemetry.step !== undefined
                  ? { step: event.telemetry.step }
                  : {})
              }
            : {})
      });
    });

    try {
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/generations',
        payload: {
          presetId: 'img2img-basic/basic',
          presetParams: {
            prompt: 'queue me'
          }
        }
      });
      const created = createResponse.json() as { id: string };

      const queueResponse = await app.inject({
        method: 'POST',
        url: `/api/generations/${created.id}/queue`
      });
      expect(queueResponse.statusCode).toBe(200);
      expect(queueResponse.json()).toMatchObject({
        id: created.id,
        status: 'queued'
      });
      expect(queueResponse.json()).toEqual(
        expect.objectContaining({
          queuedAt: expect.any(String)
        })
      );
      expect(telemetryEvents).toEqual([
        {
          runId: expect.any(String),
          sequence: 1,
          source: generationTelemetrySources.api,
          status: 'queued'
        }
      ]);
    } finally {
      unsubscribe();
      await app.close();
    }
  });

  it('given_offline_app_status_when_queueing_generation_then_request_is_rejected_and_generation_remains_draft', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'fg-gen-'));
    tempDirs.push(root);
    await mkdir(root, { recursive: true });
    const config = await loadTestConfig(root);
    const store = createGenerationStore();

    const app = buildTestServer({
      config,
      presetCatalog: createCatalog(),
      generationStore: store,
      runtimeStatus: createRuntimeStatusFixture('Offline')
    });

    try {
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/generations',
        payload: {
          presetId: 'img2img-basic/basic',
          presetParams: {
            prompt: 'queue me later'
          }
        }
      });
      const created = createResponse.json() as { id: string };

      const queueResponse = await app.inject({
        method: 'POST',
        url: `/api/generations/${created.id}/queue`
      });

      expect(queueResponse.statusCode).toBe(409);
      expect(queueResponse.json()).toMatchObject({
        message: expect.stringMatching(/offline/i)
      });

      const stored = await store.getById(created.id);
      expect(stored).toMatchObject({
        id: created.id,
        status: 'draft',
        queuedAt: null
      });
    } finally {
      await app.close();
    }
  });

  it('given_startup_failed_app_status_when_queueing_generation_then_request_is_rejected_and_generation_remains_draft', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'fg-gen-'));
    tempDirs.push(root);
    await mkdir(root, { recursive: true });
    const config = await loadTestConfig(root);
    const store = createGenerationStore();

    const app = buildTestServer({
      config,
      presetCatalog: createCatalog(),
      generationStore: store,
      runtimeStatus: createRuntimeStatusFixture('StartupFailed', {
        lastError: 'startup failed'
      })
    });

    try {
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/generations',
        payload: {
          presetId: 'img2img-basic/basic',
          presetParams: {
            prompt: 'queue me later'
          }
        }
      });
      const created = createResponse.json() as { id: string };

      const queueResponse = await app.inject({
        method: 'POST',
        url: `/api/generations/${created.id}/queue`
      });

      expect(queueResponse.statusCode).toBe(409);
      expect(queueResponse.json()).toMatchObject({
        message: expect.stringMatching(/startupfailed|startup failed/i)
      });

      const stored = await store.getById(created.id);
      expect(stored).toMatchObject({
        id: created.id,
        status: 'draft',
        queuedAt: null
      });
    } finally {
      await app.close();
    }
  });

  it('given_starting_app_status_when_queueing_generation_then_generation_is_queued', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'fg-gen-'));
    tempDirs.push(root);
    await mkdir(root, { recursive: true });
    const config = await loadTestConfig(root);

    const app = buildTestServer({
      config,
      presetCatalog: createCatalog(),
      runtimeStatus: createRuntimeStatusFixture('Starting')
    });

    try {
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/generations',
        payload: {
          presetId: 'img2img-basic/basic',
          presetParams: {
            prompt: 'queue me during startup'
          }
        }
      });
      const created = createResponse.json() as { id: string };

      const queueResponse = await app.inject({
        method: 'POST',
        url: `/api/generations/${created.id}/queue`
      });

      expect(queueResponse.statusCode).toBe(200);
      expect(queueResponse.json()).toMatchObject({
        id: created.id,
        status: 'queued',
        queuedAt: expect.any(String)
      });
    } finally {
      await app.close();
    }
  });

  it('given_queued_generation_when_canceled_then_status_becomes_canceled', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'fg-gen-'));
    tempDirs.push(root);
    await mkdir(root, { recursive: true });
    const config = await loadTestConfig(root);
    const eventBus = createGenerationEventBus();
    const telemetry = createSpyTelemetry(eventBus);

    const app = buildTestServer({
      config,
      presetCatalog: createCatalog(),
      generationEventBus: eventBus,
      generationTelemetry: telemetry,
      runtimeStatus: createRuntimeStatusFixture('Online')
    });

    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/generations',
      payload: {
        presetId: 'img2img-basic/basic',
        presetParams: {
          prompt: 'cancel me'
        }
      }
    });
    const created = createResponse.json() as { id: string };

    await app.inject({
      method: 'POST',
      url: `/api/generations/${created.id}/queue`
    });

    const cancelResponse = await app.inject({
      method: 'POST',
      url: `/api/generations/${created.id}/cancel`
    });
    expect(cancelResponse.statusCode).toBe(200);
    expect(cancelResponse.json()).toMatchObject({
      id: created.id,
      status: 'canceled'
    });
    expect(telemetry.clearRun).toHaveBeenCalledWith(created.id);

    await app.close();
  });

  it('given_submitted_generation_when_canceled_then_interrupt_is_requested_and_status_becomes_canceled', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'fg-gen-'));
    tempDirs.push(root);
    await mkdir(root, { recursive: true });
    const config = await loadTestConfig(root);
    const store = createGenerationStore();

    const generation = await store.create({
      presetId: 'img2img-basic/basic',
      templateId: 'img2img-basic',
      presetParams: {
        prompt: 'cancel submitted'
      }
    });
    await store.save({
      ...generation,
      status: 'submitted',
      updatedAt: '2026-04-07T10:00:00.000Z'
    });

    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      if (String(input).endsWith('/api/interrupt')) {
        return new Response('{}', {
          status: 200,
          headers: {
            'content-type': 'application/json'
          }
        });
      }

      return new Response('{}', {
        status: 404,
        headers: {
          'content-type': 'application/json'
        }
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const app = buildTestServer({
      config,
      presetCatalog: createCatalog(),
      generationStore: store
    });

    try {
      const cancelResponse = await app.inject({
        method: 'POST',
        url: `/api/generations/${generation.id}/cancel`
      });

      expect(cancelResponse.statusCode).toBe(200);
      expect(cancelResponse.json()).toMatchObject({
        id: generation.id,
        status: 'canceled'
      });
      expect(fetchMock).toHaveBeenCalledWith(
        'http://127.0.0.1:8188/api/interrupt',
        expect.objectContaining({
          method: 'POST'
        })
      );
    } finally {
      vi.unstubAllGlobals();
      await app.close();
    }
  });

  it('given_submitted_generation_when_completion_wins_race_after_interrupt_then_cancel_returns_terminal_state', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'fg-gen-'));
    tempDirs.push(root);
    await mkdir(root, { recursive: true });
    const config = await loadTestConfig(root);
    const store = createGenerationStore();

    const generation = await store.create({
      presetId: 'img2img-basic/basic',
      templateId: 'img2img-basic',
      presetParams: {
        prompt: 'race me'
      }
    });
    await store.save({
      ...generation,
      status: 'submitted',
      updatedAt: '2026-04-07T10:00:00.000Z'
    });

    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      if (String(input).endsWith('/api/interrupt')) {
        await store.markCompleted(generation.id);
        return new Response('{}', {
          status: 200,
          headers: {
            'content-type': 'application/json'
          }
        });
      }

      return new Response('{}', {
        status: 404,
        headers: {
          'content-type': 'application/json'
        }
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const app = buildTestServer({
      config,
      presetCatalog: createCatalog(),
      generationStore: store
    });

    try {
      const cancelResponse = await app.inject({
        method: 'POST',
        url: `/api/generations/${generation.id}/cancel`
      });

      expect(cancelResponse.statusCode).toBe(200);
      expect(cancelResponse.json()).toMatchObject({
        id: generation.id,
        status: 'completed'
      });
    } finally {
      vi.unstubAllGlobals();
      await app.close();
    }
  });

  it('given_submitted_generation_when_interrupt_fails_then_generation_becomes_failed', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'fg-gen-'));
    tempDirs.push(root);
    await mkdir(root, { recursive: true });
    const config = await loadTestConfig(root);
    const store = createGenerationStore();
    const eventBus = createGenerationEventBus();
    const telemetry = createSpyTelemetry(eventBus);

    const generation = await store.create({
      presetId: 'img2img-basic/basic',
      templateId: 'img2img-basic',
      presetParams: {
        prompt: 'cancel submitted failure'
      }
    });
    await store.save({
      ...generation,
      status: 'submitted',
      updatedAt: '2026-04-07T10:00:00.000Z'
    });

    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      if (String(input).endsWith('/api/interrupt')) {
        return new Response(JSON.stringify({ message: 'interrupt unavailable' }), {
          status: 500,
          headers: {
            'content-type': 'application/json'
          }
        });
      }

      return new Response('{}', {
        status: 404,
        headers: {
          'content-type': 'application/json'
        }
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const app = buildTestServer({
      config,
      presetCatalog: createCatalog(),
      generationStore: store,
      generationEventBus: eventBus,
      generationTelemetry: telemetry
    });

    try {
      const cancelResponse = await app.inject({
        method: 'POST',
        url: `/api/generations/${generation.id}/cancel`
      });

      expect(cancelResponse.statusCode).toBe(200);
      expect(cancelResponse.json()).toMatchObject({
        id: generation.id,
        status: 'failed',
        error: expect.stringMatching(/interrupt unavailable/i)
      });
      expect(telemetry.clearRun).toHaveBeenCalledWith(generation.id);
    } finally {
      vi.unstubAllGlobals();
      await app.close();
    }
  });

  it('given_terminal_generation_when_canceled_then_status_conflict_is_returned', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'fg-gen-'));
    tempDirs.push(root);
    await mkdir(root, { recursive: true });
    const config = await loadTestConfig(root);
    const store = createGenerationStore();

    for (const status of ['completed', 'failed', 'canceled'] as const) {
      const generation = await store.create({
        presetId: 'img2img-basic/basic',
        templateId: 'img2img-basic',
        presetParams: {
          prompt: `${status} cancel`
        }
      });
      await store.save({
        ...generation,
        status,
        updatedAt: '2026-04-07T10:00:00.000Z'
      });
    }

    const app = buildTestServer({
      config,
      presetCatalog: createCatalog(),
      generationStore: store
    });

    try {
      const generations = await store.list();

      for (const generation of generations) {
        const cancelResponse = await app.inject({
          method: 'POST',
          url: `/api/generations/${generation.id}/cancel`
        });

        expect(cancelResponse.statusCode).toBe(409);
        expect(cancelResponse.json()).toMatchObject({
          message: `Generation "${generation.id}" cannot be canceled in status "${generation.status}".`
        });
      }
    } finally {
      await app.close();
    }
  });

  it('given_generation_when_input_uploaded_then_file_is_saved_and_reference_is_persisted', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'fg-gen-'));
    tempDirs.push(root);
    await mkdir(root, { recursive: true });
    const config = await loadTestConfig(root);

    const app = buildTestServer({
      config,
      presetCatalog: createCatalog()
    });

    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/generations',
      payload: {
        presetId: 'img2img-basic/basic',
        presetParams: {
          prompt: 'with input'
        }
      }
    });
    const created = createResponse.json() as { id: string };

    const fileBuffer = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const multipart = buildMultipartPayload('input.png', fileBuffer);

    const uploadResponse = await app.inject({
      method: 'POST',
      url: `/api/generations/${created.id}/input`,
      headers: {
        'content-type': `multipart/form-data; boundary=${multipart.boundary}`
      },
      payload: multipart.payload
    });
    expect(uploadResponse.statusCode).toBe(204);
    expect(uploadResponse.body).toBe('');
    expect(uploadResponse.headers['content-type']).toBeUndefined();

    const detailResponse = await app.inject({
      method: 'GET',
      url: `/api/generations/${created.id}`
    });
    expect(detailResponse.statusCode).toBe(200);
    const detail = detailResponse.json() as {
      presetParams: {
        inputImagePath: string;
      };
    };
    expect(detail.presetParams.inputImagePath).toContain(`${created.id}`);
    expect(detail.presetParams.inputImagePath).toContain('original');

    const savedContent = await readFile(detail.presetParams.inputImagePath);
    expect(savedContent.equals(fileBuffer)).toBe(true);

    await app.close();
  });

  it('given_invalid_model_field_value_when_creating_generation_then_request_is_rejected', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'fg-gen-'));
    tempDirs.push(root);
    await mkdir(root, { recursive: true });
    const config = await loadTestConfig(root);

    const app = buildTestServer({
      config,
      presetCatalog: createCatalog()
    });

    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/generations',
      payload: {
        presetId: 'img2img-basic/basic',
        presetParams: {
          prompt: 'hello',
          steps: 'fast'
        }
      }
    });

    expect(createResponse.statusCode).toBe(400);
    expect(createResponse.json()).toMatchObject({
      message: expect.stringMatching(/steps/i)
    });

    await app.close();
  });

  it('given_missing_runtime_only_input_when_queueing_generation_then_request_is_rejected', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'fg-gen-'));
    tempDirs.push(root);
    await mkdir(root, { recursive: true });
    const config = await loadTestConfig(root);

    const app = buildTestServer({
      config,
      presetCatalog: createCatalogRequiringInput(),
      runtimeStatus: createRuntimeStatusFixture('Online')
    });

    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/generations',
      payload: {
        presetId: 'img2img-basic/basic',
        presetParams: {
          prompt: 'queue me'
        }
      }
    });
    const created = createResponse.json() as { id: string };

    const queueResponse = await app.inject({
      method: 'POST',
      url: `/api/generations/${created.id}/queue`
    });

    expect(queueResponse.statusCode).toBe(400);
    expect(queueResponse.json()).toMatchObject({
      message: expect.stringMatching(/inputImagePath/i)
    });

    await app.close();
  });

  it('given_deleted_uploaded_input_when_queueing_generation_then_request_is_rejected_before_remote_execution', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'fg-gen-'));
    tempDirs.push(root);
    await mkdir(root, { recursive: true });
    const config = await loadTestConfig(root);

    const app = buildTestServer({
      config,
      presetCatalog: createCatalogRequiringInput(),
      runtimeStatus: createRuntimeStatusFixture('Online')
    });

    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/generations',
      payload: {
        presetId: 'img2img-basic/basic',
        presetParams: {
          prompt: 'queue me'
        }
      }
    });
    const created = createResponse.json() as { id: string };

    const fileBuffer = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const multipart = buildMultipartPayload('input.png', fileBuffer);
    const uploadResponse = await app.inject({
      method: 'POST',
      url: `/api/generations/${created.id}/input`,
      headers: {
        'content-type': `multipart/form-data; boundary=${multipart.boundary}`
      },
      payload: multipart.payload
    });
    expect(uploadResponse.statusCode).toBe(204);

    const detailResponse = await app.inject({
      method: 'GET',
      url: `/api/generations/${created.id}`
    });
    const detail = detailResponse.json() as {
      presetParams: {
        inputImagePath: string;
      };
    };

    await rm(detail.presetParams.inputImagePath, { force: true });

    const queueResponse = await app.inject({
      method: 'POST',
      url: `/api/generations/${created.id}/queue`
    });

    expect(queueResponse.statusCode).toBe(400);
    expect(queueResponse.json()).toMatchObject({
      message: expect.stringMatching(/inputImagePath/i),
      issues: expect.arrayContaining([expect.stringMatching(/inputImagePath/i)])
    });

    await app.close();
  });

  it('given_directory_input_when_queueing_generation_then_request_is_rejected_as_unreadable', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'fg-gen-'));
    tempDirs.push(root);
    await mkdir(root, { recursive: true });
    const config = await loadTestConfig(root);
    const store = createGenerationStore();

    const generation = await store.create({
      presetId: 'img2img-basic/basic',
      templateId: 'img2img-basic',
      presetParams: {
        prompt: 'queue me',
        inputImagePath: root
      }
    });

    const app = buildTestServer({
      config,
      presetCatalog: createCatalogRequiringInput(),
      generationStore: store,
      runtimeStatus: createRuntimeStatusFixture('Online')
    });

    const queueResponse = await app.inject({
      method: 'POST',
      url: `/api/generations/${generation.id}/queue`
    });

    expect(queueResponse.statusCode).toBe(400);
    expect(queueResponse.json()).toMatchObject({
      message: expect.stringMatching(/inputImagePath/i),
      issues: expect.arrayContaining([expect.stringMatching(/readable/i)])
    });

    await app.close();
  });

  it('given_multiple_queue_validation_issues_when_queueing_generation_then_all_issues_are_returned', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'fg-gen-'));
    tempDirs.push(root);
    await mkdir(root, { recursive: true });
    const config = await loadTestConfig(root);
    const store = createGenerationStore();

    const generation = await store.create({
      presetId: 'img2img-basic/basic',
      templateId: 'img2img-basic',
      presetParams: {
        prompt: 'queue me',
        steps: 0
      }
    });

    const app = buildTestServer({
      config,
      presetCatalog: createCatalogRequiringInput(),
      generationStore: store,
      runtimeStatus: createRuntimeStatusFixture('Online')
    });

    const queueResponse = await app.inject({
      method: 'POST',
      url: `/api/generations/${generation.id}/queue`
    });

    expect(queueResponse.statusCode).toBe(400);
    expect(queueResponse.json()).toMatchObject({
      message: expect.stringMatching(/inputImagePath|steps/i),
      issues: expect.arrayContaining([
        expect.stringMatching(/inputImagePath/i),
        expect.stringMatching(/steps/i)
      ])
    });

    await app.close();
  });

  it('given_random_seed_mode_when_queueing_generation_then_generated_seed_is_persisted_for_that_run', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'fg-gen-'));
    tempDirs.push(root);
    await mkdir(root, { recursive: true });
    const config = await loadTestConfig(root);
    const store = createGenerationStore();

    const app = buildTestServer({
      config,
      presetCatalog: createCatalogWithSeed(),
      generationStore: store,
      runtimeStatus: createRuntimeStatusFixture('Online')
    });

    try {
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/generations',
        payload: {
          presetId: 'txt2img-basic/basic',
          presetParams: {
            prompt: 'lock my seed'
          }
        }
      });
      const created = createResponse.json() as { id: string };

      const queueResponse = await app.inject({
        method: 'POST',
        url: `/api/generations/${created.id}/queue`
      });

      expect(queueResponse.statusCode).toBe(200);

      const stored = await store.getStoredById(created.id);
      expect(stored).toMatchObject({
        id: created.id,
        status: 'queued'
      });
      expect(stored?.presetParams.seedMode).toBe('random');
      expect(stored?.presetParams.seed).toEqual(expect.any(Number));
      expect(Number.isInteger(stored?.presetParams.seed)).toBe(true);
      expect(
        (
          stored as
            | (typeof stored & {
                executionSnapshot?: {
                  resolvedParams?: Record<string, unknown>;
                  workflow?: Record<string, unknown>;
                };
              })
            | undefined
        )?.executionSnapshot
      ).toMatchObject({
        resolvedParams: {
          seedMode: 'random',
          seed: stored?.presetParams.seed
        },
        workflow: {
          '7': {
            inputs: {
              seed: stored?.presetParams.seed
            }
          }
        }
      });
    } finally {
      await app.close();
    }
  });

  it('given_random_seed_mode_when_requeueing_generation_then_a_new_seed_is_generated', async () => {
    const randomSpy = vi.spyOn(Math, 'random');
    randomSpy.mockReturnValueOnce(0.1).mockReturnValueOnce(0.2);

    const root = await mkdtemp(path.join(tmpdir(), 'fg-gen-'));
    tempDirs.push(root);
    await mkdir(root, { recursive: true });
    const config = await loadTestConfig(root);
    const store = createGenerationStore();

    const app = buildTestServer({
      config,
      presetCatalog: createCatalogWithSeed(),
      generationStore: store,
      runtimeStatus: createRuntimeStatusFixture('Online')
    });

    try {
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/generations',
        payload: {
          presetId: 'txt2img-basic/basic',
          presetParams: {
            prompt: 'reroll my seed'
          }
        }
      });
      const created = createResponse.json() as { id: string };

      const firstQueueResponse = await app.inject({
        method: 'POST',
        url: `/api/generations/${created.id}/queue`
      });
      expect(firstQueueResponse.statusCode).toBe(200);

      const firstStored = await store.getStoredById(created.id);
      expect(firstStored).toBeDefined();
      if (firstStored === undefined) {
        throw new Error(`Generation "${created.id}" was not stored after queueing.`);
      }
      const firstSeed = Number(firstStored.presetParams.seed);
      expect(Number.isInteger(firstSeed)).toBe(true);

      await store.save({
        ...firstStored,
        status: 'completed',
        error: null,
        updatedAt: '2026-04-07T10:00:00.000Z'
      });

      const secondQueueResponse = await app.inject({
        method: 'POST',
        url: `/api/generations/${created.id}/queue`
      });
      expect(secondQueueResponse.statusCode).toBe(200);

      const secondStored = await store.getStoredById(created.id);
      const secondSeed = Number(secondStored?.presetParams.seed);
      expect(Number.isInteger(secondSeed)).toBe(true);
      expect(secondSeed).not.toBe(firstSeed);
      expect(secondStored?.presetParams.seedMode).toBe('random');
    } finally {
      randomSpy.mockRestore();
      await app.close();
    }
  });

  it('given_completed_generation_with_stale_prompt_metadata_when_requeued_then_prompt_metadata_is_cleared', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'fg-gen-'));
    tempDirs.push(root);
    await mkdir(root, { recursive: true });
    const config = await loadTestConfig(root);
    const store = createGenerationStore();

    const created = await store.create({
      presetId: 'txt2img-basic/basic',
      templateId: 'txt2img-basic',
      presetParams: {
        prompt: 'rerun me',
        seedMode: 'fixed',
        seed: 123
      }
    });
    await store.save({
      ...created,
      status: 'submitted',
      queuedAt: '2026-04-07T10:00:00.000Z',
      updatedAt: '2026-04-07T10:00:00.000Z'
    });
    await store.recordPromptRequest(created.id, {
      prompt: {
        '3': {
          class_type: 'SaveImage'
        }
      }
    });
    await store.recordPromptResponse(created.id, {
      promptId: 'prompt-1'
    });
    await store.markCompleted(created.id);

    const app = buildTestServer({
      config,
      presetCatalog: createCatalogWithSeed(),
      generationStore: store,
      runtimeStatus: createRuntimeStatusFixture('Online')
    });

    try {
      const queueResponse = await app.inject({
        method: 'POST',
        url: `/api/generations/${created.id}/queue`
      });

      expect(queueResponse.statusCode).toBe(200);

      const stored = await store.getStoredById(created.id);
      expect(stored).toMatchObject({
        id: created.id,
        status: 'queued',
        promptRequest: null,
        promptResponse: null,
        error: null
      });
    } finally {
      await app.close();
    }
  });

  it('given_completed_generation_when_deleted_then_input_and_output_artifacts_are_removed', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'fg-gen-'));
    tempDirs.push(root);
    await mkdir(root, { recursive: true });
    const config = await loadTestConfig(root);
    const store = createGenerationStore();

    const generation = await store.create({
      presetId: 'img2img-basic/basic',
      templateId: 'img2img-basic',
      presetParams: {
        prompt: 'delete me'
      }
    });
    await store.save({
      ...generation,
      status: 'completed',
      updatedAt: '2026-04-07T10:00:00.000Z'
    });

    const inputDir = path.join(root, generation.id);
    const outputDir = path.join(tmpdir(), 'fg-gen-output-delete', generation.id);
    tempDirs.push(path.dirname(outputDir));
    await mkdir(path.join(inputDir, 'original'), { recursive: true });
    await mkdir(outputDir, { recursive: true });
    await writeFile(path.join(inputDir, 'original', 'input.png'), Buffer.from([1, 2, 3]));
    await writeFile(path.join(outputDir, 'result.png'), Buffer.from([4, 5, 6]));

    const configWithOutputRoot = {
      ...config,
      paths: {
        ...config.paths,
        outputs: path.dirname(outputDir)
      }
    };

    const app = buildTestServer({
      config: configWithOutputRoot,
      presetCatalog: createCatalog(),
      generationStore: store
    });

    try {
      const deleteResponse = await app.inject({
        method: 'DELETE',
        url: `/api/generations/${generation.id}`
      });

      expect(deleteResponse.statusCode).toBe(204);
      await expect(stat(inputDir)).rejects.toThrow();
      await expect(stat(outputDir)).rejects.toThrow();
    } finally {
      await app.close();
    }
  });

  it('given_submitted_generation_when_deleted_then_conflict_is_returned', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'fg-gen-'));
    tempDirs.push(root);
    await mkdir(root, { recursive: true });
    const config = await loadTestConfig(root);
    const store = createGenerationStore();

    const generation = await store.create({
      presetId: 'img2img-basic/basic',
      templateId: 'img2img-basic',
      presetParams: {
        prompt: 'cannot delete me yet'
      }
    });
    await store.save({
      ...generation,
      status: 'submitted',
      updatedAt: '2026-04-07T10:00:00.000Z'
    });

    const app = buildTestServer({
      config,
      presetCatalog: createCatalog(),
      generationStore: store
    });

    try {
      const deleteResponse = await app.inject({
        method: 'DELETE',
        url: `/api/generations/${generation.id}`
      });

      expect(deleteResponse.statusCode).toBe(409);
      expect(deleteResponse.json()).toMatchObject({
        message: `Generation "${generation.id}" cannot be deleted while submitted.`
      });

      const stored = await store.getById(generation.id);
      expect(stored).toMatchObject({
        id: generation.id,
        status: 'submitted'
      });
    } finally {
      await app.close();
    }
  });
});
