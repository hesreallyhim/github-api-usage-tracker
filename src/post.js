const core = require('@actions/core');
const { fetchRateLimit } = require('./rate-limit');
const { log, warn, error, parseBuckets } = require('./log');
const {
  maybeWriteJson,
  buildSummaryContent,
  parseCheckpointTime,
  processBuckets
} = require('./post-utils');

async function run() {
  if (core.getState('skip_rest') === 'true') {
    log('Skipping post step');
    return;
  }
  try {
    const buckets = parseBuckets(core.getInput('buckets'));
    if (buckets.length === 0) {
      log('No valid buckets specified for tracking');
      return;
    }

    // Get starting state (saved by pre.js)
    const startingState = core.getState('starting_rate_limits');
    if (!startingState) {
      error('No starting rate limit data found; skipping');
      return;
    }
    const startingResources = JSON.parse(startingState);
    const startTime = Number(core.getState('start_time'));
    const hasStartTime = Number.isFinite(startTime);

    // Get checkpoint state if available (saved by checkpoint.js)
    const checkpointState = core.getState('checkpoint_rate_limits');
    const checkpointResources = checkpointState ? JSON.parse(checkpointState) : null;
    const checkpointTimeMs = checkpointResources ? Number(core.getState('checkpoint_time')) : null;
    const checkpointTimeSeconds = parseCheckpointTime(checkpointTimeMs);

    // Fetch final rate limits
    log('Fetching final rate limits...');
    const endingLimits = await fetchRateLimit();
    const endingResources = endingLimits.resources || {};
    const endTime = Date.now();
    const endTimeSeconds = Math.floor(endTime / 1000);
    const duration = hasStartTime ? endTime - startTime : null;

    log('Final Snapshot:');
    log('-----------------');
    log(JSON.stringify(endingResources, null, 2));

    // Process each bucket
    const { data, crossedBuckets, totalUsed, warnings } = processBuckets({
      buckets,
      startingResources,
      endingResources,
      checkpointResources,
      endTimeSeconds,
      checkpointTimeSeconds
    });
    warnings.forEach((msg) => warn(msg));

    // Set output
    const output = {
      total: totalUsed,
      duration_ms: duration,
      buckets_data: data,
      crossed_reset: crossedBuckets.length > 0
    };
    core.setOutput('usage', JSON.stringify(output, null, 2));

    // Write JSON file if path specified
    const outPath = (core.getInput('output_path') || '').trim();
    maybeWriteJson(outPath, output);

    // Build summary
    log(`Preparing summary table for ${Object.keys(data).length} bucket(s)`);
    const summaryContent = buildSummaryContent(data, crossedBuckets, totalUsed, duration);
    const summary = core.summary
      .addHeading('GitHub API Usage Tracker Summary')
      .addTable(summaryContent.table);
    for (const section of summaryContent.sections) {
      summary.addRaw(section, true);
    }
    await summary.write();
  } catch (err) {
    error(`Post step failed: ${err.message}`);
  }
}

run();
