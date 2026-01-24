const fs = require('fs');
const path = require('path');

/**
 * Writes JSON-stringified data to a file if a valid pathname is provided.
 */
function maybeWriteJson(pathname, data) {
  if (!pathname) return;
  const dir = path.dirname(pathname);
  if (dir && dir !== '.') fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(pathname, JSON.stringify(data, null, 2));
}

/**
 * Converts milliseconds to a human-readable duration string.
 *
 * @param {number} ms - milliseconds.
 *
 * @returns {string} - formatted milliseconds string.
 */
function formatMs(ms) {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (minutes < 60) return `${minutes}m ${secs}s`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}m ${secs}s`;
}

function makeSummaryTable(resources, options = {}) {
  const useMinimumHeader = Boolean(options.useMinimumHeader);
  const summaryTable = [
    [
      { data: 'Bucket', header: true },
      { data: 'Used (Start)', header: true },
      { data: 'Remaining (Start)', header: true },
      { data: 'Used (End)', header: true },
      { data: 'Remaining (End)', header: true },
      { data: useMinimumHeader ? 'Used (Minimum)' : 'Used (Total)', header: true }
    ]
  ];
  const formatValue = (value) => (Number.isFinite(value) ? String(value) : 'n/a');
  for (const [bucket, info] of Object.entries(resources)) {
    const used = info.used || {};
    const remaining = info.remaining || {};
    summaryTable.push([
      { data: bucket },
      { data: formatValue(used.start) },
      { data: formatValue(remaining.start) },
      { data: formatValue(used.end) },
      { data: formatValue(remaining.end) },
      { data: formatValue(used.total) }
    ]);
  }

  return summaryTable;
}

/**
 * Computes usage when the reset window was crossed.
 * Returns { used, warnings } on success, or { error } on failure.
 */
function computeUsageAcrossReset(ctx) {
  const { startingLimit, endingLimit, endingRemaining, startingRemaining } = ctx;
  const { checkpointBucket, checkpointTimeSeconds, resetPre } = ctx;

  if (!Number.isFinite(startingLimit) || !Number.isFinite(endingLimit)) {
    return { error: 'invalid_limit' };
  }

  const warnings = [];
  if (startingLimit !== endingLimit) {
    warnings.push('limit_changed_across_reset');
  }

  let used = endingLimit - endingRemaining;

  // Add checkpoint usage if available and before reset
  if (
    checkpointBucket &&
    Number.isFinite(checkpointTimeSeconds) &&
    checkpointTimeSeconds < resetPre
  ) {
    const checkpointRemaining = Number(checkpointBucket.remaining);
    if (Number.isFinite(checkpointRemaining)) {
      const checkpointUsed = startingRemaining - checkpointRemaining;
      if (checkpointUsed > 0) {
        used += checkpointUsed;
      }
    }
  }

  return { used, warnings };
}

/**
 * Computes usage within the same reset window.
 * Returns { used, warnings } on success, or { error } on failure.
 */
function computeUsageWithinWindow(ctx) {
  const { startingLimit, endingLimit, startingRemaining, endingRemaining } = ctx;

  if (
    Number.isFinite(startingLimit) &&
    Number.isFinite(endingLimit) &&
    startingLimit !== endingLimit
  ) {
    return { error: 'limit_changed_without_reset' };
  }

  const used = startingRemaining - endingRemaining;
  if (used < 0) {
    return { error: 'remaining_increased_without_reset' };
  }

  return { used, warnings: [] };
}

/**
 * Computes usage stats for a single bucket using pre/post snapshots.
 * An optional checkpoint snapshot can tighten the minimum when a reset is crossed.
 *
 * @param {object} startingBucket - bucket from the pre snapshot.
 * @param {object} endingBucket - bucket from the post snapshot.
 * @param {number} endTimeSeconds - post snapshot time in seconds.
 * @param {object} [checkpointBucket] - bucket from the checkpoint snapshot.
 * @param {number} [checkpointTimeSeconds] - checkpoint snapshot time in seconds.
 * @returns {object} usage details and validation status.
 */
function computeBucketUsage(
  startingBucket,
  endingBucket,
  endTimeSeconds,
  checkpointBucket,
  checkpointTimeSeconds
) {
  const fail = (reason) => ({
    valid: false,
    used: 0,
    remaining: undefined,
    crossed_reset: false,
    warnings: [],
    reason
  });

  if (!startingBucket || !endingBucket) {
    return fail('missing_bucket');
  }

  const startingRemaining = Number(startingBucket.remaining);
  const endingRemaining = Number(endingBucket.remaining);
  if (!Number.isFinite(startingRemaining) || !Number.isFinite(endingRemaining)) {
    return fail('invalid_remaining');
  }

  const startingLimit = Number(startingBucket.limit);
  const endingLimit = Number(endingBucket.limit);
  const resetPre = Number(startingBucket.reset);
  const crossedReset = Number.isFinite(resetPre) && endTimeSeconds >= resetPre;

  const ctx = {
    startingLimit,
    endingLimit,
    startingRemaining,
    endingRemaining,
    resetPre,
    checkpointBucket,
    checkpointTimeSeconds
  };

  const computation = crossedReset ? computeUsageAcrossReset(ctx) : computeUsageWithinWindow(ctx);

  if (computation.error) {
    const result = fail(computation.error);
    result.crossed_reset = crossedReset;
    return result;
  }

  if (computation.used < 0) {
    const result = fail('negative_usage');
    result.crossed_reset = crossedReset;
    return result;
  }

  return {
    valid: true,
    used: computation.used,
    remaining: endingRemaining,
    crossed_reset: crossedReset,
    warnings: computation.warnings
  };
}

/**
 * Returns a warning message for invalid bucket usage (without prefix).
 *
 * @param {string} reason - the reason code from computeBucketUsage.
 * @param {string} bucket - the bucket name.
 * @returns {string} - formatted warning message.
 */
function getUsageWarningMessage(reason, bucket) {
  switch (reason) {
    case 'invalid_remaining':
      return `Invalid remaining count for bucket "${bucket}"; skipping`;
    case 'invalid_limit':
      return `Invalid limit for bucket "${bucket}" during reset crossing; skipping`;
    case 'limit_changed_without_reset':
      return `Limit changed without reset for bucket "${bucket}"; skipping`;
    case 'remaining_increased_without_reset':
      return `Remaining increased without reset for bucket "${bucket}"; skipping`;
    case 'negative_usage':
      return `Negative usage for bucket "${bucket}" detected; skipping`;
    default:
      return `Invalid usage data for bucket "${bucket}"; skipping`;
  }
}

/** Returns a finite number or null. */
const finiteOrNull = (v) => (Number.isFinite(v) ? v : null);

/** Computes used (limit - remaining) if both are finite, else null. */
const computeUsed = (limit, remaining) =>
  Number.isFinite(limit) && Number.isFinite(remaining) ? limit - remaining : null;

/**
 * Builds the data object for a single bucket from snapshots and computed usage.
 *
 * @param {object} startingBucket - bucket from the pre snapshot.
 * @param {object} endingBucket - bucket from the post snapshot.
 * @param {object} usage - computed usage from computeBucketUsage.
 * @returns {object} - bucket data with used/remaining info.
 */
function buildBucketData(startingBucket, endingBucket, usage) {
  const startRemaining = Number(startingBucket.remaining);
  const startLimit = Number(startingBucket.limit);
  const endRemaining = Number(endingBucket.remaining);
  const endLimit = Number(endingBucket.limit);

  return {
    used: {
      start: computeUsed(startLimit, startRemaining),
      end: computeUsed(endLimit, endRemaining),
      total: usage.used
    },
    remaining: {
      start: finiteOrNull(startRemaining),
      end: finiteOrNull(endRemaining)
    },
    crossed_reset: usage.crossed_reset
  };
}

/**
 * Builds the summary content object for the job summary.
 *
 * @param {object} data - bucket data keyed by bucket name.
 * @param {string[]} crossedBuckets - list of buckets that crossed reset.
 * @param {number} totalUsed - total API calls/points used.
 * @param {number|null} duration - action duration in milliseconds.
 * @returns {object} - summary content with table and HTML sections.
 */
function buildSummaryContent(data, crossedBuckets, totalUsed, duration) {
  const totalIsMinimum = crossedBuckets.length > 0;
  const table = makeSummaryTable(data, { useMinimumHeader: totalIsMinimum });

  const sections = [];
  const push = (htmlArray) => sections.push(...htmlArray);

  if (totalIsMinimum) {
    push([
      `<p><strong>Reset Window Crossed:</strong> Yes (${crossedBuckets.join(', ')})</p>`,
      '<p><strong>Total Usage:</strong> Cannot be computed - reset window was crossed.</p>',
      `<p><strong>Minimum API Calls/Points Used:</strong> ${totalUsed}</p>`
    ]);
  } else {
    push([`<p><strong>Total API Calls/Points Used:</strong> ${totalUsed}</p>`]);
  }

  push([
    `<p><strong>Action Duration:</strong> ${duration !== null ? formatMs(duration) : 'Unknown'}</p>`
  ]);

  return { table, sections };
}

/**
 * Parses checkpoint time from milliseconds to seconds.
 * @param {number|null} checkpointTimeMs - checkpoint time in milliseconds.
 * @returns {number|null} - checkpoint time in seconds, or null if invalid.
 */
function parseCheckpointTime(checkpointTimeMs) {
  return Number.isFinite(checkpointTimeMs) && checkpointTimeMs > 0
    ? Math.floor(checkpointTimeMs / 1000)
    : null;
}

/**
 * Processes all buckets and computes usage data.
 *
 * @param {object} params - processing parameters.
 * @param {string[]} params.buckets - list of bucket names to process.
 * @param {object} params.startingResources - starting rate limit resources.
 * @param {object} params.endingResources - ending rate limit resources.
 * @param {object|null} params.checkpointResources - checkpoint resources (optional).
 * @param {number} params.endTimeSeconds - end time in seconds.
 * @param {number|null} params.checkpointTimeSeconds - checkpoint time in seconds.
 * @returns {object} - { data, crossedBuckets, totalUsed, warnings }.
 */
function processBuckets({
  buckets,
  startingResources,
  endingResources,
  checkpointResources,
  endTimeSeconds,
  checkpointTimeSeconds
}) {
  const data = {};
  const crossedBuckets = [];
  const warnings = [];
  let totalUsed = 0;

  for (const bucket of buckets) {
    const startingBucket = startingResources[bucket];
    const endingBucket = endingResources[bucket];

    if (!startingBucket) {
      warnings.push(`Starting bucket "${bucket}" not found; skipping`);
      continue;
    }
    if (!endingBucket) {
      warnings.push(`Ending bucket "${bucket}" not found; skipping`);
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
      warnings.push(getUsageWarningMessage(usage.reason, bucket));
      continue;
    }

    if (usage.warnings.includes('limit_changed_across_reset')) {
      warnings.push(
        `Limit changed across reset for bucket "${bucket}"; results may reflect a token change`
      );
    }

    data[bucket] = buildBucketData(startingBucket, endingBucket, usage);
    if (usage.crossed_reset) {
      crossedBuckets.push(bucket);
    }
    totalUsed += usage.used;
  }

  return { data, crossedBuckets, totalUsed, warnings };
}

module.exports = {
  maybeWriteJson,
  formatMs,
  makeSummaryTable,
  computeBucketUsage,
  getUsageWarningMessage,
  buildBucketData,
  buildSummaryContent,
  parseCheckpointTime,
  processBuckets
};
