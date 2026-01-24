const core = require('@actions/core');
const { fetchRateLimit } = require('./rate-limit');
const { log, warn, error } = require('./log');

async function run() {
  try {
    const token = core.getInput('token');

    if (!token) {
      error('GitHub token is required for API Usage Tracker');
      core.saveState('skip_rest', 'true');
      return;
    }

    const startTime = Date.now();
    core.saveState('start_time', String(startTime));

    log('Fetching initial rate limits...');

    const limits = await fetchRateLimit();
    const resources = limits.resources || {};

    log('Initial Snapshot:');
    log('-----------------');
    log(JSON.stringify(resources, null, 2));

    core.saveState('starting_rate_limits', JSON.stringify(resources));
  } catch (err) {
    warn(`Pre step failed: ${err.message}`);
  }
}

run();
