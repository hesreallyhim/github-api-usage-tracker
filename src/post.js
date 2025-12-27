const core = require('@actions/core');
const fs = require('fs');
const path = require('path');
const { fetchRateLimit } = require('./rate-limit');
const { isQuiet, log } = require('./log');

function numState(key) {
  const n = Number(core.getState(key));
  return Number.isFinite(n) ? n : undefined;
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

    const start = {
      core: numState('start_core_remaining'),
      graphql: numState('start_graphql_remaining'),
      search: numState('start_search_remaining')
    };

    const limits = await fetchRateLimit(token);
    const res = limits.resources || {};
    const usage = {};

    for (const area of ['core', 'graphql', 'search']) {
      if (start[area] !== undefined && res[area]) {
        usage[area] = Math.max(0, start[area] - res[area].remaining);
        log(quiet, `${area} used: ${usage[area]}`);
      }
    }

    core.setOutput('usage', JSON.stringify(usage));

    const outPath = (core.getInput('output_path') || '').trim();
    maybeWrite(outPath, usage);
  } catch (err) {
    core.warning(`Post step failed: ${err.message}`);
  }
}

run();
