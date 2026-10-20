import { spawnSync } from 'node:child_process';

const environment = { ...process.env, E2E_TELEMETRY_DISABLED: '1' };
const build = spawnSync('npm', ['run', 'build'], { stdio: 'inherit', env: environment });
if (build.error) throw build.error;
if (build.status !== 0) process.exit(build.status ?? 1);

const test = spawnSync('npx', ['e2e', 'run', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: environment,
});
if (test.error) throw test.error;
if (test.status !== 0) process.exit(test.status ?? 1);

const visual = spawnSync('node', ['e2e/visual-check.mjs'], { stdio: 'inherit', env: environment });
if (visual.error) throw visual.error;
process.exit(visual.status ?? 1);
