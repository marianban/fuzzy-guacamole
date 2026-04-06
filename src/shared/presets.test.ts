import { describe, expect, it } from 'vitest';

import { presetModelFieldSchema } from './presets.js';

describe('presetModelFieldSchema', () => {
  it('given_field_without_category_id_when_parsed_then_validation_succeeds', () => {
    const result = presetModelFieldSchema.safeParse({
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
        type: 'input',
        multiline: true,
        rows: 4
      }
    });

    expect(result.success).toBe(true);
  });
});
