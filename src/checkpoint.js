const core = require('@actions/core');
const { fetchRateLimit } = require('./rate-limit');
const { log } = require('./log');

async function run() {
  if (core.getState('skip_rest') === 'true') {
    log('[github-api-usage-tracker] Skipping checkpoint step');
    return;
  }
  try {
    log('[github-api-usage-tracker] Fetching checkpoint rate limits...');
    const limits = await fetchRateLimit();
    const resources = limits.resources || {};

    log('[github-api-usage-tracker] Checkpoint Snapshot:');
    log('[github-api-usage-tracker] ---------------------');
    log(`[github-api-usage-tracker] ${JSON.stringify(resources, null, 2)}`);

    core.saveState('checkpoint_time', String(Date.now()));
    core.saveState('checkpoint_rate_limits', JSON.stringify(resources));
  } catch (err) {
    core.warning(`[github-api-usage-tracker] Main step snapshot failed: ${err.message}`);
  }
}

run();
