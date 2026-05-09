// @vitest-environment node

import { afterEach, describe, expect, it } from 'vitest';

import { generationTelemetrySources } from '../../../shared/generation-telemetry.js';
import { createGenerationEventBus } from '../../generations/events.js';
import { createBuildServerOptions } from '../../test-support/build-server-options.js';
import { buildServer } from '../server-app.js';

describe('generation SSE route', () => {
  const apps: ReturnType<typeof buildServer>[] = [];

  afterEach(async () => {
    await Promise.all(
      apps.splice(0).map(async (app) => {
        await app.close();
      })
    );
  });

  it('given_generation_events_when_streaming_then_sse_frames_include_connection_comment_and_serialized_event', async () => {
    const eventBus = createGenerationEventBus();
    const app = buildServer(
      createBuildServerOptions({
        generationEventBus: eventBus
      })
    );
    apps.push(app);

    await app.listen({ host: '127.0.0.1', port: 0 });
    const address = app.server.address();
    if (address === null || typeof address === 'string') {
      throw new Error('Expected an address object for the test server.');
    }

    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/events/generations`
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');

    const reader = response.body?.getReader();
    if (reader === undefined) {
      throw new Error('Expected a readable SSE response body.');
    }

    const initialChunk = await reader.read();
    const initialText = Buffer.from(initialChunk.value ?? new Uint8Array()).toString(
      'utf8'
    );
    expect(initialText).toContain(': connected\n\n');

    eventBus.publish({
      type: 'telemetry',
      generationId: '11111111-1111-4111-8111-111111111111',
      runId: '22222222-2222-4222-8222-222222222222',
      sequence: 1,
      occurredAt: '2026-04-07T10:00:00.000Z',
      telemetry: {
        kind: 'milestone',
        source: generationTelemetrySources.api,
        status: 'queued',
        message: 'Generation queued for execution.'
      }
    });

    const eventChunk = await reader.read();
    const eventText = Buffer.from(eventChunk.value ?? new Uint8Array()).toString('utf8');
    expect(eventText).toContain('event: generation\n');
    expect(eventText).toContain(
      `data: {"type":"telemetry","generationId":"11111111-1111-4111-8111-111111111111","runId":"22222222-2222-4222-8222-222222222222","sequence":1,"occurredAt":"2026-04-07T10:00:00.000Z","telemetry":{"kind":"milestone","source":"${generationTelemetrySources.api}","status":"queued","message":"Generation queued for execution."}}\n\n`
    );

    reader.cancel();
  });
});
