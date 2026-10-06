import type { E2EConfig } from 'e2e';
import { web } from '@e2e-dev/web';
import { chatgpt } from 'e2e/oauth/chatgpt';

export default {
  tests: 'e2e/**/*.e2e.ts',
  workers: 1,
  timeout: 120_000,
  retries: 0,
  trace: 'on',
  agents: {
    default: {
      model: chatgpt('gpt-6-luna'),
      system: 'Test only this local site. Never open external links or submit a form. Complete the stated reader goal and verify the resulting page.',
    },
  },
  targets: [
    {
      name: 'public',
      engine: web({ viewport: { width: 1280, height: 800 } }),
      app: {
        url: 'http://127.0.0.1:4329',
        command: {
          executable: 'python3',
          args: ['-m', 'http.server', '4329', '--bind', '127.0.0.1', '--directory', 'dist'],
          log: '.e2e/logs/public.log',
        },
      },
    },
    {
      name: 'fixture',
      engine: web({ viewport: { width: 1280, height: 800 } }),
      app: {
        url: 'http://127.0.0.1:4330',
        command: {
          executable: 'node',
          args: ['node_modules/astro/bin/astro.mjs', 'dev', '--host', '127.0.0.1', '--port', '4330'],
          env: { ASTRO_DEV_BACKGROUND: '0' },
          startupTimeout: 120_000,
          log: '.e2e/logs/fixture.log',
        },
      },
    },
  ],
} satisfies E2EConfig;
