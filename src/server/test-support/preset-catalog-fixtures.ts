import { createPresetCatalog } from '../presets/preset-catalog.js';
import type { PresetModelField } from '../../shared/presets.js';

interface BasicImg2ImgTestCatalogOptions {
  includeStepsField?: boolean;
}

export function createBasicImg2ImgTestCatalog(
  options: BasicImg2ImgTestCatalogOptions = {}
) {
  const fields: PresetModelField[] = [
    {
      id: 'prompt',
      fieldType: 'string',
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
        type: 'input',
        multiline: true,
        rows: 4
      }
    }
  ];
  if (options.includeStepsField === true) {
    fields.push(createStepsField());
  }

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
      fields
    },
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

  return createPresetCatalog([summary], new Map([[detail.id, detail]]));
}

function createStepsField(): PresetModelField {
  return {
    id: 'steps',
    fieldType: 'integer',
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
      type: 'slider',
      min: 1,
      max: 100,
      step: 1
    }
  };
}

export function createExecutionTestCatalog() {
  const summary = {
    id: 'txt2img-basic/basic',
    name: 'Txt2Img - Basic',
    type: 'txt2img' as const,
    templateId: 'txt2img-basic',
    templateFile: 'preset.template.json',
    defaults: {
      prompt: 'default prompt',
      steps: 5,
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
        },
        {
          id: 'advanced',
          label: {
            en: 'Advanced'
          },
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
          categoryId: 'advanced',
          order: 20,
          label: {
            en: 'Steps'
          },
          default: 5,
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
          categoryId: 'advanced',
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
          fieldType: 'integer' as const,
          categoryId: 'advanced',
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
            type: 'input' as const
          }
        }
      ]
    },
    template: {
      id: 'txt2img-basic',
      type: 'txt2img' as const,
      implicitRuntimeParamKeys: [],
      workflow: {
        '14': {
          class_type: 'PromptNode',
          inputs: { prompt: '{{prompt}}' }
        },
        '7': {
          class_type: 'KSampler',
          inputs: {
            seed: '{{seed}}',
            steps: '{{steps}}'
          }
        },
        '3': {
          class_type: 'SaveImage',
          inputs: {
            filename_prefix: 'result'
          }
        }
      }
    }
  };

  return createPresetCatalog([summary], new Map([[detail.id, detail]]));
}
