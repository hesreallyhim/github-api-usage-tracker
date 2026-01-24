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
  const result = {
    valid: false,
    used: 0,
    remaining: undefined,
    crossed_reset: false,
    warnings: []
  };

  if (!startingBucket || !endingBucket) {
    result.reason = 'missing_bucket';
    return result;
  }

  const startingRemaining = Number(startingBucket.remaining);
  const endingRemaining = Number(endingBucket.remaining);
  if (!Number.isFinite(startingRemaining) || !Number.isFinite(endingRemaining)) {
    result.reason = 'invalid_remaining';
    return result;
  }

  const startingLimit = Number(startingBucket.limit);
  const endingLimit = Number(endingBucket.limit);
  const resetPre = Number(startingBucket.reset);
  const crossedReset = Number.isFinite(resetPre) && endTimeSeconds >= resetPre;
  result.crossed_reset = crossedReset;

  let used;
  if (crossedReset) {
    if (!Number.isFinite(startingLimit) || !Number.isFinite(endingLimit)) {
      result.reason = 'invalid_limit';
      return result;
    }
    if (startingLimit !== endingLimit) {
      result.warnings.push('limit_changed_across_reset');
    }
    used = endingLimit - endingRemaining;

    if (
      checkpointBucket &&
      Number.isFinite(checkpointTimeSeconds) &&
      Number.isFinite(resetPre) &&
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
  } else {
    if (
      Number.isFinite(startingLimit) &&
      Number.isFinite(endingLimit) &&
      startingLimit !== endingLimit
    ) {
      result.reason = 'limit_changed_without_reset';
      return result;
    }
    used = startingRemaining - endingRemaining;
    if (used < 0) {
      result.reason = 'remaining_increased_without_reset';
      return result;
    }
  }

  if (used < 0) {
    result.reason = 'negative_usage';
    return result;
  }

  result.valid = true;
  result.used = used;
  result.remaining = endingRemaining;
  return result;
}

/**
 * Returns a warning message for invalid bucket usage.
 *
 * @param {string} reason - the reason code from computeBucketUsage.
 * @param {string} bucket - the bucket name.
 * @returns {string} - formatted warning message.
 */
function getUsageWarningMessage(reason, bucket) {
  const prefix = '[github-api-usage-tracker]';
  switch (reason) {
    case 'invalid_remaining':
      return `${prefix} Invalid remaining count for bucket "${bucket}"; skipping`;
    case 'invalid_limit':
      return `${prefix} Invalid limit for bucket "${bucket}" during reset crossing; skipping`;
    case 'limit_changed_without_reset':
      return `${prefix} Limit changed without reset for bucket "${bucket}"; skipping`;
    case 'remaining_increased_without_reset':
      return `${prefix} Remaining increased without reset for bucket "${bucket}"; skipping`;
    case 'negative_usage':
      return `${prefix} Negative usage for bucket "${bucket}" detected; skipping`;
    default:
      return `${prefix} Invalid usage data for bucket "${bucket}"; skipping`;
  }
}

/**
 * Builds the data object for a single bucket from snapshots and computed usage.
 *
 * @param {object} startingBucket - bucket from the pre snapshot.
 * @param {object} endingBucket - bucket from the post snapshot.
 * @param {object} usage - computed usage from computeBucketUsage.
 * @returns {object} - bucket data with used/remaining info.
 */
function buildBucketData(startingBucket, endingBucket, usage) {
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

  return {
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

  if (totalIsMinimum) {
    sections.push(
      `<p><strong>Reset Window Crossed:</strong> Yes (${crossedBuckets.join(', ')})</p>`
    );
    sections.push(
      '<p><strong>Total Usage:</strong> Cannot be computed - reset window was crossed.</p>'
    );
    sections.push(`<p><strong>Minimum API Calls/Points Used:</strong> ${totalUsed}</p>`);
  } else {
    sections.push(`<p><strong>Total API Calls/Points Used:</strong> ${totalUsed}</p>`);
  }

  sections.push(
    `<p><strong>Action Duration:</strong> ${duration !== null ? formatMs(duration) : 'Unknown'}</p>`
  );

  return { table, sections };
}

module.exports = {
  formatMs,
  makeSummaryTable,
  computeBucketUsage,
  getUsageWarningMessage,
  buildBucketData,
  buildSummaryContent
};
