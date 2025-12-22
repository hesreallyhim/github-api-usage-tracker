const core = require("@actions/core");
const { fetchRateLimit } = require("./rate-limit");
const { parseLogLevel, log } = require("./log");

async function run() {
  try {
    const token = core.getInput("token");
    const logLevel = parseLogLevel(core.getInput("log_level"));

    core.saveState("log_level", logLevel);

    const limits = await fetchRateLimit(token);
    const res = limits.resources || {};

    if (!res.core) throw new Error("Missing core rate-limit data");

    for (const area of ["core", "graphql", "search"]) {
      if (!res[area]) continue;
      core.saveState(`start_${area}_remaining`, String(res[area].remaining));
      if (res[area].reset)
        core.saveState(`start_${area}_reset`, String(res[area].reset));
    }

    log("info", logLevel, "Captured starting GitHub API rate limits");
  } catch (err) {
    core.warning(`Pre step failed: ${err.message}`);
  }
}

run();
