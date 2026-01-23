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
      deps.core.error('GitHub token is required for API Usage Tracker');
      deps.core.saveState('skip_post', 'true');
      return;
    }

    const startTime = Date.now();
    deps.core.saveState('start_time', String(startTime));

    deps.log('[github-api-usage-tracker] Fetching initial rate limits...');

    const limits = await deps.fetchRateLimit();
    const resources = limits.resources || {};

    deps.log('[github-api-usage-tracker] Initial Snapshot:');
    deps.log('[github-api-usage-tracker] -----------------');
    deps.log(`[github-api-usage-tracker] ${JSON.stringify(resources, null, 2)}`);

    deps.core.saveState('starting_rate_limits', JSON.stringify(resources));
  } catch (err) {
    deps.core.warning(`Pre step failed: ${err.message}`);
  }
}

if (require.main === module) {
  run();
}

module.exports = { run };
