const core = require('@actions/core');
const { fetchRateLimit } = require('./rate-limit');
const { log, warn } = require('./log');

async function run() {
  if (core.getState('skip_rest') === 'true') {
    log('Skipping checkpoint step');
    return;
  }
  try {
    log('Fetching checkpoint rate limits...');
    const limits = await fetchRateLimit();
    const resources = limits.resources || {};

    log('Checkpoint Snapshot:');
    log('---------------------');
    log(JSON.stringify(resources, null, 2));

    core.saveState('checkpoint_time', String(Date.now()));
    core.saveState('checkpoint_rate_limits', JSON.stringify(resources));
  } catch (err) {
    warn(`Main step snapshot failed: ${err.message}`);
  }
}

run();
