// @vitest-environment node

import path from 'node:path';

import { describe, expect, test } from 'vitest';

import {
  comfyFixturePaths,
  loadCapturedComfyFixture,
  loadComfyWorkflow
} from './comfy-fixtures.js';

describe('Comfy fixture test support', () => {
  test('given_comfy_fixture_helpers_when_loading_files_then_contract_and_workflow_are_returned', async () => {
    expect(path.basename(comfyFixturePaths.capturedContract)).toBe(
      'comfy-v0.8.2-contract.json'
    );
    expect(path.basename(comfyFixturePaths.tinyInputImage)).toBe('tiny.png');

    const fixture = await loadCapturedComfyFixture();
    expect(fixture.metadata.comfyVersion).toBe('0.8.2');
    expect(fixture.responses.submitPrompt.prompt_id.length).toBeGreaterThan(0);

    const workflow = await loadComfyWorkflow(comfyFixturePaths.img2imgTemplate);
    expect(workflow['12']).toBeDefined();
  });
});
