/**
 * Retrieves a numeric state value from the GitHub Actions state.
 *
 * @param {string} key - The state key to retrieve.
 * @returns {number|undefined} - The numeric value if valid and finite, otherwise undefined.
 */

/**
 * Writes a summary table of API resource usage to the GitHub Actions summary.
 *
 * @param {Object.<string, {used: number, remaining: number}>} resources - Object mapping bucket names to usage info.
 */

/**
 * Main post-action function that calculates and reports GitHub API usage.
 * Fetches final rate limits, compares with starting values, and outputs usage data.
 *
 * @async
 * @returns {Promise<void>}
 */
const core = require('@actions/core');
const fs = require('fs');
const path = require('path');
const { fetchRateLimit } = require('./rate-limit');
const { log, parseBuckets } = require('./log');
const { formatMs, makeSummaryTable, computeBucketUsage } = require('./post-utils');

/**
 * Writes JSON-stringified data to a file if a valid pathname is provided.
 *
 * @param {string} pathname - file path to write to.
 * @param {object} data - data to write.
 */
function maybeWrite(pathname, data) {
  if (!pathname) return;
  const dir = path.dirname(pathname);
  if (dir && dir !== '.') fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(pathname, JSON.stringify(data, null, 2));
}

async function run() {
  if (core.getState('skip_post') === 'true') {
    log('[github-api-usage-tracker] Skipping post step due to missing token');
    return;
  }
  try {
    const buckets = parseBuckets(core.getInput('buckets'));

    if (buckets.length === 0) {
      log('[github-api-usage-tracker] No valid buckets specified for tracking');
      return;
    }

    const startingState = core.getState('starting_rate_limits');
    if (!startingState) {
      core.error(
        '[github-api-usage-tracker] No starting rate limit data found; skipping post step'
      );
      return;
    }
    let startingResources;
    try {
      startingResources = JSON.parse(startingState);
    } catch {
      core.error(
        '[github-api-usage-tracker] Failed to parse starting rate limit data; skipping post step'
      );
      return;
    }
    const startTime = Number(core.getState('start_time'));
    const hasStartTime = Number.isFinite(startTime);
    if (!hasStartTime) {
      core.error(
        '[github-api-usage-tracker] Invalid or missing start time; duration will be reported as unknown'
      );
    }
    const checkpointState = core.getState('checkpoint_rate_limits');
    let checkpointResources;
    let checkpointTimeSeconds = null;
    if (checkpointState) {
      try {
        checkpointResources = JSON.parse(checkpointState);
      } catch {
        core.warning(
          '[github-api-usage-tracker] Failed to parse checkpoint rate limit data; ignoring checkpoint snapshot'
        );
      }
    }
    if (checkpointResources) {
      const checkpointTimeMs = Number(core.getState('checkpoint_time'));
      checkpointTimeSeconds =
        Number.isFinite(checkpointTimeMs) && checkpointTimeMs > 0
          ? Math.floor(checkpointTimeMs / 1000)
          : null;
    }
    const endTime = Date.now();
    const endTimeSeconds = Math.floor(endTime / 1000);
    const duration = hasStartTime ? endTime - startTime : null;

    log('[github-api-usage-tracker] Fetching final rate limits...');

    const endingLimits = await fetchRateLimit();
    const endingResources = endingLimits.resources || {};

    log('[github-api-usage-tracker] Final Snapshot:');
    log('[github-api-usage-tracker] -----------------');
    log(`[github-api-usage-tracker] ${JSON.stringify(endingResources, null, 2)}`);

    const data = {};
    const crossedBuckets = [];
    let totalUsed = 0;
    let totalIsMinimum = false;

    for (const bucket of buckets) {
      const startingBucket = startingResources[bucket];
      const endingBucket = endingResources[bucket];
      if (!startingBucket) {
        core.warning(
          `[github-api-usage-tracker] Starting rate limit bucket "${bucket}" not found; skipping`
        );
        continue;
      }
      if (!endingBucket) {
        core.warning(
          `[github-api-usage-tracker] Ending rate limit bucket "${bucket}" not found; skipping`
        );
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
        switch (usage.reason) {
          case 'invalid_remaining':
            core.warning(
              `[github-api-usage-tracker] Invalid remaining count for bucket "${bucket}"; skipping`
            );
            break;
          case 'invalid_limit':
            core.warning(
              `[github-api-usage-tracker] Invalid limit for bucket "${bucket}" during reset crossing; skipping`
            );
            break;
          case 'limit_changed_without_reset':
            core.warning(
              `[github-api-usage-tracker] Limit changed without reset for bucket "${bucket}"; skipping`
            );
            break;
          case 'remaining_increased_without_reset':
            core.warning(
              `[github-api-usage-tracker] Remaining increased without reset for bucket "${bucket}"; skipping`
            );
            break;
          case 'negative_usage':
            core.warning(
              `[github-api-usage-tracker] Negative usage for bucket "${bucket}" detected; skipping`
            );
            break;
          default:
            core.warning(
              `[github-api-usage-tracker] Invalid usage data for bucket "${bucket}"; skipping`
            );
            break;
        }
        continue;
      }

      if (usage.warnings.includes('limit_changed_across_reset')) {
        core.warning(
          `[github-api-usage-tracker] Limit changed across reset for bucket "${bucket}"; results may reflect a token change`
        );
      }

      const startingRemaining = Number(startingBucket.remaining);
      const startingLimit = Number(startingBucket.limit);
      const endingRemaining = Number(endingBucket.remaining);
      const endingLimit = Number(endingBucket.limit);
      const startUsed =
        Number.isFinite(startingLimit) && Number.isFinite(startingRemaining)
          ? startingLimit - startingRemaining
          : null;
      const endUsed =
        Number.isFinite(endingLimit) && Number.isFinite(endingRemaining)
          ? endingLimit - endingRemaining
          : null;
      data[bucket] = {
        used: {
          start: startUsed,
          end: endUsed,
          total: usage.used
        },
        remaining: {
          start: Number.isFinite(startingRemaining) ? startingRemaining : null,
          end: Number.isFinite(endingRemaining) ? endingRemaining : null
        },
        crossed_reset: usage.crossed_reset
      };
      if (usage.crossed_reset) {
        crossedBuckets.push(bucket);
      }
      if (usage.crossed_reset) {
        totalIsMinimum = true;
      }
      totalUsed += usage.used;
    }

    // Set output
    const output = {
      total: totalUsed,
      duration_ms: duration,
      buckets_data: data,
      crossed_reset: totalIsMinimum
    };
    core.setOutput('usage', JSON.stringify(output, null, 2));

    // Write JSON file if path specified
    const outPath = (core.getInput('output_path') || '').trim();
    maybeWrite(outPath, output);

    log(
      `[github-api-usage-tracker] Preparing summary table for ${Object.keys(data).length} bucket(s)`
    );
    const summary = core.summary
      .addHeading('GitHub API Usage Tracker Summary')
      .addTable(makeSummaryTable(data, { useMinimumHeader: totalIsMinimum }));
    if (crossedBuckets.length > 0) {
      summary.addRaw(
        `<p><strong>Reset Window Crossed:</strong> Yes (${crossedBuckets.join(', ')})</p>`,
        true
      );
      summary.addRaw(
        '<p><strong>Total Usage:</strong> Total usage cannot be computed - usage reset window was crossed.</p>',
        true
      );
      summary.addRaw(`<p><strong>Minimum API Calls/Points Used:</strong> ${totalUsed}</p>`, true);
    }
    summary.addRaw(
      `<p><strong>Action Duration:</strong> ${
        hasStartTime ? formatMs(duration) : 'Unknown (data missing)'
      }</p>`,
      true
    );
    if (crossedBuckets.length === 0) {
      summary.addRaw(`<p><strong>Total API Calls/Points Used:</strong> ${totalUsed}</p>`, true);
    }
    summary.write();
  } catch (err) {
    core.error(`[github-api-usage-tracker] Post step failed: ${err.message}`);
  }
}

run();
