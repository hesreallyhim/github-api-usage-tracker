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

module.exports = { formatMs, makeSummaryTable };
