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
const { formatMs, makeSummaryTable } = require('./post-utils');

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
    const endTime = Date.now();
    const duration = hasStartTime ? endTime - startTime : null;

    log('[github-api-usage-tracker] Fetching final rate limits...');

    const endingLimits = await fetchRateLimit();
    const endingResources = endingLimits.resources || {};

    const data = {};
    let totalUsed = 0;

    for (const bucket of buckets) {
      const startingUsed = startingResources[bucket]?.used;
      const endingUsed = endingResources[bucket]?.used;
      if (startingUsed === undefined) {
        core.warning(
          `[github-api-usage-tracker] Starting rate limit bucket "${bucket}" not found; skipping`
        );
        continue;
      }
      if (endingUsed === undefined) {
        core.warning(
          `[github-api-usage-tracker] Ending rate limit bucket "${bucket}" not found; skipping`
        );
        continue;
      }
      let used = endingUsed - startingUsed;
      if (used < 0) {
        core.warning(
          `[github-api-usage-tracker] Negative usage for bucket "${bucket}" detected; clamping to 0`
        );
        used = 0;
      }
      const remaining = endingResources[bucket].remaining;
      data[bucket] = { used, remaining };
      totalUsed += used;
    }

    // Set output
    const output = {
      total: totalUsed,
      duration_ms: duration,
      buckets_data: data
    };
    core.setOutput('usage', JSON.stringify(output));

    // Write JSON file if path specified
    const outPath = (core.getInput('output_path') || '').trim();
    maybeWrite(outPath, output);

    core.summary
      .addHeading('GitHub API Usage Tracker Summary')
      .addTable(makeSummaryTable(data))
      .addRaw(
        `<p><strong>Action Duration:</strong> ${
          hasStartTime ? formatMs(duration) : 'Unknown (data missing)'
        }</p>`,
        true
      )
      .addRaw(`<p><strong>Total API Calls/Points Used:</strong> ${totalUsed}</p>`, true)
      .write();
  } catch (err) {
    core.error(`[github-api-usage-tracker] Post step failed: ${err.message}`);
  }
}

run();
