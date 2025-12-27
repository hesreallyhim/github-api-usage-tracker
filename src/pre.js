const core = require("@actions/core");
const { fetchRateLimit } = require("./rate-limit");
const { isQuiet, log, parseBuckets, VALID_BUCKETS } = require("./log");

async function run() {
  try {
    const token = core.getInput("token");
    const quiet = isQuiet(core.getInput("quiet"));
    const buckets = parseBuckets(core.getInput("buckets"));

    core.saveState("quiet", String(quiet));
    core.saveState("buckets", buckets.join(","));
    core.saveState("start_time", String(Date.now()));

    log(quiet, "[github-api-usage-tracker] Fetching initial rate limits...");

    const limits = await fetchRateLimit(token, quiet);
    const res = limits.resources || {};

    log(quiet, `[github-api-usage-tracker] Available buckets: ${Object.keys(res).join(", ")}`);

    for (const bucket of VALID_BUCKETS) {
      if (!res[bucket]) continue;
      core.saveState(`start_${bucket}_remaining`, String(res[bucket].remaining));
    }

    log(quiet, `[github-api-usage-tracker] Saved starting values for: ${buckets.join(", ")}`);
  } catch (err) {
    core.warning(`Pre step failed: ${err.message}`);
  }
}

run();
