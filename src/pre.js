const core = require('@actions/core');
const { fetchRateLimit } = require('./rate-limit');
const { log } = require('./log');

async function run() {
  try {
    const token = core.getInput('token');

    if (!token) {
      core.error('GitHub token is required for API Usage Tracker');
      core.saveState('skip_post', 'true');
      return;
    }

    const startTime = Date.now();
    core.saveState('start_time', String(startTime));

    log('[github-api-usage-tracker] Fetching initial rate limits...');

    const limits = await fetchRateLimit();
    const resources = limits.resources || {};

    log('[github-api-usage-tracker] Initial Snapshot:');
    log('[github-api-usage-tracker] -----------------');
    log(`[github-api-usage-tracker] ${JSON.stringify(resources, null, 2)}`);

    core.saveState('starting_rate_limits', JSON.stringify(resources));
  } catch (err) {
    core.warning(`Pre step failed: ${err.message}`);
  }
}

run();
