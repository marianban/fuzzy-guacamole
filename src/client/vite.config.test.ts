import { describe, expect, it } from 'vitest';

import viteConfig from './vite.config.js';

describe('client dev server proxy', () => {
  it('given_openapi_docs_path_when_using_dev_server_then_proxies_to_backend', () => {
    const openApiProxy = viteConfig.server?.proxy?.['/openapi'];

    expect(openApiProxy).toMatchObject({
      target: 'http://localhost:3000',
      changeOrigin: true
    });
  });
});
