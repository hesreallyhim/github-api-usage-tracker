const core = require('@actions/core');
const { fetchRateLimit } = require('./rate-limit');
const { log } = require('./log');

async function run(overrides = {}) {
  const deps = {
    core,
    fetchRateLimit,
    log,
    ...overrides
  };
  try {
    const token = deps.core.getInput('token');
    if (!token) {
      deps.log('[github-api-usage-tracker] Skipping checkpoint snapshot due to missing token');
      return;
    }

    deps.log('[github-api-usage-tracker] Fetching checkpoint rate limits...');
    const limits = await deps.fetchRateLimit();
    const resources = limits.resources || {};

    deps.log('[github-api-usage-tracker] Checkpoint Snapshot:');
    deps.log('[github-api-usage-tracker] ---------------------');
    deps.log(`[github-api-usage-tracker] ${JSON.stringify(resources, null, 2)}`);

    deps.core.saveState('checkpoint_time', String(Date.now()));
    deps.core.saveState('checkpoint_rate_limits', JSON.stringify(resources));
  } catch (err) {
    deps.core.warning(`[github-api-usage-tracker] Main step snapshot failed: ${err.message}`);
  }
}

if (require.main === module) {
  run();
}

module.exports = { run };
