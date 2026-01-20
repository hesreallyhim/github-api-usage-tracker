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

function makeSummaryTable(resources) {
  const summaryTable = [
    [
      { data: 'Bucket', header: true },
      { data: 'Used', header: true },
      { data: 'Remaining', header: true }
    ]
  ];
  for (const [bucket, info] of Object.entries(resources)) {
    summaryTable.push([
      { data: bucket },
      { data: String(info.used) },
      { data: String(info.remaining) }
    ]);
  }

  return summaryTable;
}

/**
 * Computes usage stats for a single bucket using pre/post snapshots.
 *
 * @param {object} startingBucket - bucket from the pre snapshot.
 * @param {object} endingBucket - bucket from the post snapshot.
 * @param {number} endTimeSeconds - post snapshot time in seconds.
 * @returns {object} usage details and validation status.
 */
function computeBucketUsage(startingBucket, endingBucket, endTimeSeconds) {
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
    used = startingLimit - startingRemaining + (endingLimit - endingRemaining);
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

module.exports = { formatMs, makeSummaryTable, computeBucketUsage };
