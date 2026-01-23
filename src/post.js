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
 * @param {object} fsModule - fs implementation to use.
 * @param {object} pathModule - path implementation to use.
 */
function maybeWrite(pathname, data, fsModule, pathModule) {
  if (!pathname) return;
  const dir = pathModule.dirname(pathname);
  if (dir && dir !== '.') fsModule.mkdirSync(dir, { recursive: true });
  fsModule.writeFileSync(pathname, JSON.stringify(data, null, 2));
}

async function run(overrides = {}) {
  const deps = {
    core,
    fs,
    path,
    fetchRateLimit,
    log,
    parseBuckets,
    formatMs,
    makeSummaryTable,
    computeBucketUsage,
    ...overrides
  };
  if (deps.core.getState('skip_post') === 'true') {
    deps.log('[github-api-usage-tracker] Skipping post step due to missing token');
    return;
  }
  try {
    const buckets = deps.parseBuckets(deps.core.getInput('buckets'));

    if (buckets.length === 0) {
      deps.log('[github-api-usage-tracker] No valid buckets specified for tracking');
      return;
    }

    const startingState = deps.core.getState('starting_rate_limits');
    if (!startingState) {
      deps.core.error(
        '[github-api-usage-tracker] No starting rate limit data found; skipping post step'
      );
      return;
    }
    let startingResources;
    try {
      startingResources = JSON.parse(startingState);
    } catch {
      deps.core.error(
        '[github-api-usage-tracker] Failed to parse starting rate limit data; skipping post step'
      );
      return;
    }
    const startTime = Number(deps.core.getState('start_time'));
    const hasStartTime = Number.isFinite(startTime);
    if (!hasStartTime) {
      deps.core.error(
        '[github-api-usage-tracker] Invalid or missing start time; duration will be reported as unknown'
      );
    }
    const checkpointState = deps.core.getState('checkpoint_rate_limits');
    let checkpointResources;
    let checkpointTimeSeconds = null;
    if (checkpointState) {
      try {
        checkpointResources = JSON.parse(checkpointState);
      } catch {
        deps.core.warning(
          '[github-api-usage-tracker] Failed to parse checkpoint rate limit data; ignoring checkpoint snapshot'
        );
      }
    }
    if (checkpointResources) {
      const checkpointTimeMs = Number(deps.core.getState('checkpoint_time'));
      checkpointTimeSeconds =
        Number.isFinite(checkpointTimeMs) && checkpointTimeMs > 0
          ? Math.floor(checkpointTimeMs / 1000)
          : null;
    }
    const endTime = Date.now();
    const endTimeSeconds = Math.floor(endTime / 1000);
    const duration = hasStartTime ? endTime - startTime : null;

    deps.log('[github-api-usage-tracker] Fetching final rate limits...');

    const endingLimits = await deps.fetchRateLimit();
    const endingResources = endingLimits.resources || {};

    deps.log('[github-api-usage-tracker] Final Snapshot:');
    deps.log('[github-api-usage-tracker] -----------------');
    deps.log(`[github-api-usage-tracker] ${JSON.stringify(endingResources, null, 2)}`);

    const data = {};
    const crossedBuckets = [];
    let totalUsed = 0;
    let totalIsMinimum = false;

    for (const bucket of buckets) {
      const startingBucket = startingResources[bucket];
      const endingBucket = endingResources[bucket];
      if (!startingBucket) {
        deps.core.warning(
          `[github-api-usage-tracker] Starting rate limit bucket "${bucket}" not found; skipping`
        );
        continue;
      }
      if (!endingBucket) {
        deps.core.warning(
          `[github-api-usage-tracker] Ending rate limit bucket "${bucket}" not found; skipping`
        );
        continue;
      }

      const checkpointBucket = checkpointResources ? checkpointResources[bucket] : undefined;
      const usage = deps.computeBucketUsage(
        startingBucket,
        endingBucket,
        endTimeSeconds,
        checkpointBucket,
        checkpointTimeSeconds
      );
      if (!usage.valid) {
        switch (usage.reason) {
          case 'invalid_remaining':
            deps.core.warning(
              `[github-api-usage-tracker] Invalid remaining count for bucket "${bucket}"; skipping`
            );
            break;
          case 'invalid_limit':
            deps.core.warning(
              `[github-api-usage-tracker] Invalid limit for bucket "${bucket}" during reset crossing; skipping`
            );
            break;
          case 'limit_changed_without_reset':
            deps.core.warning(
              `[github-api-usage-tracker] Limit changed without reset for bucket "${bucket}"; skipping`
            );
            break;
          case 'remaining_increased_without_reset':
            deps.core.warning(
              `[github-api-usage-tracker] Remaining increased without reset for bucket "${bucket}"; skipping`
            );
            break;
          case 'negative_usage':
            deps.core.warning(
              `[github-api-usage-tracker] Negative usage for bucket "${bucket}" detected; skipping`
            );
            break;
          default:
            deps.core.warning(
              `[github-api-usage-tracker] Invalid usage data for bucket "${bucket}"; skipping`
            );
            break;
        }
        continue;
      }

      if (usage.warnings.includes('limit_changed_across_reset')) {
        deps.core.warning(
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
    deps.core.setOutput('usage', JSON.stringify(output, null, 2));

    // Write JSON file if path specified
    const outPath = (deps.core.getInput('output_path') || '').trim();
    maybeWrite(outPath, output, deps.fs, deps.path);

    deps.log(
      `[github-api-usage-tracker] Preparing summary table for ${Object.keys(data).length} bucket(s)`
    );
    const summary = deps.core.summary
      .addHeading('GitHub API Usage Tracker Summary')
      .addTable(deps.makeSummaryTable(data, { useMinimumHeader: totalIsMinimum }));
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
        hasStartTime ? deps.formatMs(duration) : 'Unknown (data missing)'
      }</p>`,
      true
    );
    if (crossedBuckets.length === 0) {
      summary.addRaw(`<p><strong>Total API Calls/Points Used:</strong> ${totalUsed}</p>`, true);
    }
    summary.write();
  } catch (err) {
    deps.core.error(`[github-api-usage-tracker] Post step failed: ${err.message}`);
  }
}

if (require.main === module) {
  run();
}

module.exports = { run, maybeWrite };
