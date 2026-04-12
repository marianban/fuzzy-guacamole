// @vitest-environment node

import { describe, expect, it } from 'vitest';
import type { PresetDetail } from '../../../shared/presets.js';

import {
  buildGenerationExecution,
  GenerationExecutionValidationError
} from './builder.js';

describe('buildGenerationExecution', () => {
  it('given_tokenized_workflow_when_materializing_then_raw_values_and_embedded_strings_are_preserved', () => {
    const preset = createPreset({
      implicitRuntimeParamKeys: ['enabled'],
      type: 'txt2img',
      workflow: {
        '1': {
          class_type: 'TestNode',
          inputs: {
            steps: '{{steps}}',
            enabled: '{{enabled}}',
            prompt: 'prefix {{prompt}}'
          }
        },
        '3': {
          class_type: 'SaveImage',
          inputs: {
            filename_prefix: 'result'
          }
        }
      }
    });

    const execution = buildGenerationExecution({
      generation: {
        id: '11111111-1111-4111-8111-111111111111',
        presetId: preset.id,
        templateId: preset.templateId,
        presetParams: {
          prompt: 'skyline',
          steps: 12,
          enabled: true,
          seedMode: 'fixed',
          seed: 123
        }
      },
      preset
    });

    expect(execution.workflow['1']).toMatchObject({
      class_type: 'TestNode',
      inputs: {
        steps: 12,
        enabled: true,
        prompt: 'prefix skyline'
      }
    });
    expect(execution.preferredOutputNodeId).toBe('3');
  });

  it('given_random_seed_mode_when_materializing_then_seed_is_replaced_with_generated_integer', () => {
    const preset = createPreset({
      workflow: {
        '7': {
          class_type: 'KSampler',
          inputs: {
            seed: '{{seed}}'
          }
        },
        '60': {
          class_type: 'SaveImage',
          inputs: {
            filename_prefix: 'result'
          }
        }
      },
      defaults: {
        prompt: 'preset prompt',
        steps: 5,
        seed: 999,
        seedMode: 'random'
      }
    });

    const execution = buildGenerationExecution({
      generation: {
        id: '11111111-1111-4111-8111-111111111111',
        presetId: preset.id,
        templateId: preset.templateId,
        presetParams: {
          prompt: 'city lights'
        }
      },
      preset,
      randomSeed: () => 424242
    });

    expect(execution.resolvedParams.seed).toBe(424242);
    expect(execution.workflow['7']).toMatchObject({
      inputs: {
        seed: 424242
      }
    });
    expect(execution.preferredOutputNodeId).toBe('60');
  });

  it('given_random_seed_mode_with_stored_seed_when_materializing_then_new_seed_is_generated', () => {
    const preset = createPreset({
      workflow: {
        '7': {
          class_type: 'KSampler',
          inputs: {
            seed: '{{seed}}'
          }
        },
        '60': {
          class_type: 'SaveImage',
          inputs: {
            filename_prefix: 'result'
          }
        }
      },
      defaults: {
        prompt: 'preset prompt',
        steps: 5,
        seedMode: 'random'
      }
    });

    const execution = buildGenerationExecution({
      generation: {
        id: '11111111-1111-4111-8111-111111111111',
        presetId: preset.id,
        templateId: preset.templateId,
        presetParams: {
          prompt: 'city lights',
          seed: 10101
        }
      },
      preset,
      randomSeed: () => 424242
    });

    expect(execution.resolvedParams.seed).toBe(424242);
    expect(execution.workflow['7']).toMatchObject({
      inputs: {
        seed: 424242
      }
    });
  });

  it('given_missing_runtime_param_when_materializing_then_validation_error_mentions_missing_token', () => {
    const preset = createPreset({
      type: 'img2img',
      implicitRuntimeParamKeys: ['inputImagePath'],
      workflow: {
        '12': {
          class_type: 'LoadImage',
          inputs: {
            image: '{{inputImagePath}}'
          }
        },
        '14': {
          class_type: 'TextNode',
          inputs: {
            prompt: '{{prompt}}'
          }
        }
      }
    });

    expect(() =>
      buildGenerationExecution({
        generation: {
          id: '11111111-1111-4111-8111-111111111111',
          presetId: preset.id,
          templateId: preset.templateId,
          presetParams: {
            prompt: 'missing input path'
          }
        },
        preset
      })
    ).toThrowError(GenerationExecutionValidationError);

    try {
      buildGenerationExecution({
        generation: {
          id: '11111111-1111-4111-8111-111111111111',
          presetId: preset.id,
          templateId: preset.templateId,
          presetParams: {
            prompt: 'missing input path'
          }
        },
        preset
      });
    } catch (error) {
      expect(error).toBeInstanceOf(GenerationExecutionValidationError);
      expect((error as Error).message).toMatch(/inputImagePath/i);
    }
  });

  it('given_runtime_only_token_not_declared_by_template_when_materializing_then_validation_rejects_it', () => {
    const preset = createPreset({
      type: 'txt2img',
      implicitRuntimeParamKeys: [],
      workflow: {
        '14': {
          class_type: 'TextNode',
          inputs: {
            prompt: '{{prompt}}',
            suffix: '{{runtimeSuffix}}'
          }
        }
      }
    });

    expect(() =>
      buildGenerationExecution({
        generation: {
          id: '11111111-1111-4111-8111-111111111111',
          presetId: preset.id,
          templateId: preset.templateId,
          presetParams: {
            prompt: 'city lights',
            runtimeSuffix: 'mist'
          }
        },
        preset
      })
    ).toThrowError(/available runtime parameter/i);
  });
});

function createPreset(
  overrides: Partial<{
    type: 'img2img' | 'txt2img';
    workflow: Record<string, unknown>;
    defaults: Record<string, unknown>;
    implicitRuntimeParamKeys: string[];
  }> = {}
): PresetDetail {
  const type = overrides.type ?? 'img2img';
  return {
    id: 'img2img-basic/basic',
    name: 'Img2Img Basic',
    type,
    templateId: 'img2img-basic',
    templateFile: 'preset.template.json',
    defaults: {
      prompt: 'preset prompt',
      steps: 5,
      seedMode: 'random',
      ...overrides.defaults
    },
    model: {
      categories: [
        {
          id: 'main',
          label: { en: 'Main' },
          order: 10,
          presentation: {
            collapsible: false,
            defaultExpanded: true
          }
        },
        {
          id: 'advanced',
          label: { en: 'Advanced' },
          order: 20,
          presentation: {
            collapsible: true,
            defaultExpanded: false
          }
        }
      ],
      fields: [
        {
          id: 'prompt',
          fieldType: 'string',
          categoryId: 'main',
          order: 10,
          label: { en: 'Prompt' },
          validation: {
            required: true,
            maxLength: 4000
          },
          control: {
            type: 'input'
          }
        },
        {
          id: 'steps',
          fieldType: 'integer',
          categoryId: 'advanced',
          order: 20,
          label: { en: 'Steps' },
          default: 5,
          validation: {
            required: true,
            min: 1,
            max: 100
          },
          control: {
            type: 'slider',
            min: 1,
            max: 100,
            step: 1
          }
        },
        {
          id: 'seedMode',
          fieldType: 'enum',
          categoryId: 'advanced',
          order: 30,
          label: { en: 'Seed Mode' },
          default: 'random',
          validation: {
            required: true
          },
          control: {
            type: 'select',
            options: [
              {
                value: 'random',
                label: { en: 'Random' }
              },
              {
                value: 'fixed',
                label: { en: 'Fixed' }
              }
            ]
          }
        },
        {
          id: 'seed',
          fieldType: 'integer',
          categoryId: 'advanced',
          order: 40,
          label: { en: 'Seed' },
          validation: {
            required: false,
            min: 0
          },
          visibility: {
            field: 'seedMode',
            equals: 'fixed'
          },
          control: {
            type: 'input'
          }
        }
      ]
    },
    template: {
      id: 'img2img-basic',
      type,
      implicitRuntimeParamKeys: overrides.implicitRuntimeParamKeys ?? [],
      workflow:
        overrides.workflow ??
        ({
          '14': {
            class_type: 'TextNode',
            inputs: {
              prompt: '{{prompt}}'
            }
          }
        } satisfies Record<string, unknown>)
    }
  };
}
