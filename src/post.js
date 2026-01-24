const core = require('@actions/core');
const fs = require('fs');
const path = require('path');
const { fetchRateLimit } = require('./rate-limit');
const { log, parseBuckets } = require('./log');
const {
  computeBucketUsage,
  getUsageWarningMessage,
  buildBucketData,
  buildSummaryContent
} = require('./post-utils');

/**
 * Writes JSON-stringified data to a file if a valid pathname is provided.
 */
function maybeWrite(pathname, data) {
  if (!pathname) return;
  const dir = path.dirname(pathname);
  if (dir && dir !== '.') fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(pathname, JSON.stringify(data, null, 2));
}

async function run() {
  if (core.getState('skip_rest') === 'true') {
    log('[github-api-usage-tracker] Skipping post step');
    return;
  }
  try {
    const buckets = parseBuckets(core.getInput('buckets'));
    if (buckets.length === 0) {
      log('[github-api-usage-tracker] No valid buckets specified for tracking');
      return;
    }

    // Get starting state (saved by pre.js)
    const startingState = core.getState('starting_rate_limits');
    if (!startingState) {
      core.error('[github-api-usage-tracker] No starting rate limit data found; skipping');
      return;
    }
    const startingResources = JSON.parse(startingState);
    const startTime = Number(core.getState('start_time'));
    const hasStartTime = Number.isFinite(startTime);

    // Get checkpoint state if available (saved by checkpoint.js)
    const checkpointState = core.getState('checkpoint_rate_limits');
    const checkpointResources = checkpointState ? JSON.parse(checkpointState) : null;
    const checkpointTimeMs = checkpointResources ? Number(core.getState('checkpoint_time')) : null;
    const checkpointTimeSeconds =
      Number.isFinite(checkpointTimeMs) && checkpointTimeMs > 0
        ? Math.floor(checkpointTimeMs / 1000)
        : null;

    // Fetch final rate limits
    log('[github-api-usage-tracker] Fetching final rate limits...');
    const endingLimits = await fetchRateLimit();
    const endingResources = endingLimits.resources || {};
    const endTime = Date.now();
    const endTimeSeconds = Math.floor(endTime / 1000);
    const duration = hasStartTime ? endTime - startTime : null;

    log('[github-api-usage-tracker] Final Snapshot:');
    log('[github-api-usage-tracker] -----------------');
    log(`[github-api-usage-tracker] ${JSON.stringify(endingResources, null, 2)}`);

    // Process each bucket
    const data = {};
    const crossedBuckets = [];
    let totalUsed = 0;

    for (const bucket of buckets) {
      const startingBucket = startingResources[bucket];
      const endingBucket = endingResources[bucket];

      if (!startingBucket) {
        core.warning(`[github-api-usage-tracker] Starting bucket "${bucket}" not found; skipping`);
        continue;
      }
      if (!endingBucket) {
        core.warning(`[github-api-usage-tracker] Ending bucket "${bucket}" not found; skipping`);
        continue;
      }

      const checkpointBucket = checkpointResources ? checkpointResources[bucket] : undefined;
      const usage = computeBucketUsage(
        startingBucket,
        endingBucket,
        endTimeSeconds,
        checkpointBucket,
        checkpointTimeSeconds
      );

      if (!usage.valid) {
        core.warning(getUsageWarningMessage(usage.reason, bucket));
        continue;
      }

      if (usage.warnings.includes('limit_changed_across_reset')) {
        core.warning(
          `[github-api-usage-tracker] Limit changed across reset for bucket "${bucket}"; results may reflect a token change`
        );
      }

      data[bucket] = buildBucketData(startingBucket, endingBucket, usage);
      if (usage.crossed_reset) {
        crossedBuckets.push(bucket);
      }
      totalUsed += usage.used;
    }

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
    maybeWrite(outPath, output);

    // Build summary
    log(
      `[github-api-usage-tracker] Preparing summary table for ${Object.keys(data).length} bucket(s)`
    );
    const summaryContent = buildSummaryContent(data, crossedBuckets, totalUsed, duration);
    const summary = core.summary
      .addHeading('GitHub API Usage Tracker Summary')
      .addTable(summaryContent.table);
    for (const section of summaryContent.sections) {
      summary.addRaw(section, true);
    }
    summary.write();
  } catch (err) {
    core.error(`[github-api-usage-tracker] Post step failed: ${err.message}`);
  }
}

run();
