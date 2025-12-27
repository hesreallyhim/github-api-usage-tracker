const core = require('@actions/core');
const fs = require('fs');
const path = require('path');
const { fetchRateLimit } = require('./rate-limit');
const { isQuiet, log, parseBuckets } = require('./log');

function numState(key) {
  const n = Number(core.getState(key));
  return Number.isFinite(n) ? n : undefined;
}

function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (minutes < 60) return `${minutes}m ${secs}s`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}m ${secs}s`;
}

function maybeWrite(pathname, data) {
  if (!pathname) return;
  const dir = path.dirname(pathname);
  if (dir && dir !== '.') fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(pathname, JSON.stringify(data, null, 2));
}

async function run() {
  try {
    const token = core.getInput('token');
    const quiet = isQuiet(core.getInput('quiet') || core.getState('quiet'));
    const buckets = parseBuckets(core.getInput('buckets') || core.getState('buckets'));
    const startTime = numState('start_time');
    const endTime = Date.now();

    log(quiet, '[github-api-usage-tracker] Fetching final rate limits...');

    const limits = await fetchRateLimit(token, quiet);
    const res = limits.resources || {};

    const data = {};
    let totalUsed = 0;

    for (const bucket of buckets) {
      const startRemaining = numState(`start_${bucket}_remaining`);
      if (startRemaining !== undefined && res[bucket]) {
        const used = Math.max(0, startRemaining - res[bucket].remaining);
        const remaining = res[bucket].remaining;
        data[bucket] = { used, remaining };
        totalUsed += used;
      }
    }

    const duration = startTime ? endTime - startTime : 0;

    // Build summary table
    const activeBuckets = Object.keys(data);
    const headerRow = [
      { data: '', header: true },
      ...activeBuckets.map(b => ({ data: b, header: true }))
    ];
    const usedRow = [
      { data: 'Used', header: true },
      ...activeBuckets.map(b => ({ data: String(data[b].used) }))
    ];
    const remainingRow = [
      { data: 'Remaining', header: true },
      ...activeBuckets.map(b => ({ data: String(data[b].remaining) }))
    ];

    await core.summary
      .addHeading('GitHub API Usage', 1)
      .addRaw(`**Total:** ${totalUsed} requests\n\n`)
      .addRaw(`**Duration:** ${formatDuration(duration)}\n\n`)
      .addTable([headerRow, usedRow, remainingRow])
      .write();

    // Set output
    const output = { total: totalUsed, duration_ms: duration, buckets: data };
    core.setOutput('usage', JSON.stringify(output));

    // Write JSON file if path specified
    const outPath = (core.getInput('output_path') || '').trim();
    maybeWrite(outPath, output);

    log(quiet, `[github-api-usage-tracker] Total API calls used: ${totalUsed}`);
  } catch (err) {
    core.warning(`Post step failed: ${err.message}`);
  }
}

run();
