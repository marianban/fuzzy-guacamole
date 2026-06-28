import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { PresetDetail, PresetListResponse } from '@shared/presets';
import { ComfyDeckTheme } from '#root/styles/comfy-deck-theme';

import { ControlPanel } from './control-panel';

const usePresetsMock = vi.fn();
const usePresetMock = vi.fn();

vi.mock('#root/api/presets/queries', () => ({
  useSuspensePreset: (id: string) => usePresetMock(id),
  useSuspensePresets: () => usePresetsMock()
}));

const presetSummary = {
  id: 'txt2img/basic',
  name: 'Basic',
  type: 'txt2img',
  templateId: 'txt2img',
  templateFile: '/data/presets/txt2img/preset.template.json',
  defaults: {
    prompt: 'cinematic forest',
    steps: 24,
    seedMode: 'fixed',
    seed: 123
  }
} satisfies PresetListResponse['presets'][number];

const presetList: PresetListResponse = {
  defaultPresetId: 'txt2img/basic',
  presets: [presetSummary]
};

const presetDetail: PresetDetail = {
  ...presetSummary,
  template: {
    id: 'txt2img',
    type: 'txt2img',
    implicitRuntimeParamKeys: [],
    workflow: {}
  },
  model: {
    categories: [
      {
        id: 'advanced',
        label: { en: 'Advanced Parameters' },
        order: 20,
        presentation: {
          collapsible: true,
          defaultExpanded: true
        }
      }
    ],
    fields: [
      {
        id: 'prompt',
        fieldType: 'string',
        order: 10,
        label: { en: 'Prompt' },
        default: '',
        validation: { required: true, maxLength: 4000 },
        control: {
          type: 'input',
          multiline: true,
          rows: 4,
          placeholder: { en: 'Describe the image' }
        }
      },
      {
        id: 'steps',
        fieldType: 'integer',
        categoryId: 'advanced',
        order: 10,
        label: { en: 'Steps' },
        default: 30,
        validation: { required: true, min: 1, max: 100 },
        control: { type: 'slider', min: 1, max: 100, step: 1 }
      },
      {
        id: 'seedMode',
        fieldType: 'enum',
        categoryId: 'advanced',
        order: 20,
        label: { en: 'Seed Mode' },
        default: 'random',
        validation: { required: true },
        control: {
          type: 'select',
          options: [
            { value: 'random', label: { en: 'Random' } },
            { value: 'fixed', label: { en: 'Fixed' } }
          ]
        }
      },
      {
        id: 'seed',
        fieldType: 'integer',
        categoryId: 'advanced',
        order: 30,
        label: { en: 'Seed' },
        validation: { required: false, min: 0 },
        visibility: { field: 'seedMode', equals: 'fixed' },
        control: { type: 'input', inputMode: 'numeric' }
      }
    ]
  }
};

function renderControlPanel() {
  return render(
    <ComfyDeckTheme>
      <ControlPanel />
    </ComfyDeckTheme>
  );
}

describe('ControlPanel', () => {
  it('given presets are loading when rendered then it shows the control panel loading overlay', () => {
    usePresetsMock.mockImplementation(() => {
      throw new Promise(() => undefined);
    });

    renderControlPanel();

    expect(screen.getByTestId('control-panel-loading-overlay')).toBeInTheDocument();
    expect(screen.queryByText('Loading presets...')).not.toBeInTheDocument();
  });

  it('given no default preset when rendered then it throws a preset configuration error', () => {
    usePresetsMock.mockReturnValue({
      data: { defaultPresetId: null, presets: [] },
      isError: false,
      isLoading: false
    });
    usePresetMock.mockImplementation((id: string) => {
      throw new Error(`Unexpected preset detail request: ${String(id)}`);
    });

    expect(() => renderControlPanel()).toThrow(
      'Preset list did not include a default preset id.'
    );

    expect(usePresetMock).not.toHaveBeenCalled();
  });

  it('given loaded preset detail when rendered then it shows selector default fields and category accordions', () => {
    usePresetsMock.mockReturnValue({
      data: presetList,
      isError: false,
      isLoading: false
    });
    usePresetMock.mockReturnValue({
      data: presetDetail,
      isError: false,
      isLoading: false
    });

    renderControlPanel();

    expect(screen.getByRole('button', { name: 'Preset Selector' })).toHaveAttribute(
      'data-preset-id',
      'txt2img/basic'
    );
    expect(screen.getByLabelText('Prompt')).toHaveValue('cinematic forest');

    const advanced = screen.getByRole('button', { name: 'Advanced Parameters' });
    expect(advanced).toHaveAttribute('aria-expanded', 'true');

    const advancedPanel = screen.getByText('Steps').closest('[role="region"]');
    expect(advancedPanel).not.toBeNull();
    expect(within(advancedPanel as HTMLElement).getByText('Steps')).toBeInTheDocument();
    expect(
      within(advancedPanel as HTMLElement).getByRole('radio', { name: 'Fixed' })
    ).toBeChecked();
    expect(within(advancedPanel as HTMLElement).getByLabelText('Seed')).toHaveValue(123);
  });
});
