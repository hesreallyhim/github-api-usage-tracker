const core = require("@actions/core");
const { fetchRateLimit } = require("./rate-limit");
const { isQuiet } = require("./log");

async function run() {
  try {
    const token = core.getInput("token");
    const quiet = isQuiet(core.getInput("quiet"));

    core.saveState("quiet", String(quiet));

    const limits = await fetchRateLimit(token);
    const res = limits.resources || {};

    if (!res.core) throw new Error("Missing core rate-limit data");

    for (const area of ["core", "graphql", "search"]) {
      if (!res[area]) continue;
      core.saveState(`start_${area}_remaining`, String(res[area].remaining));
    }
  } catch (err) {
    core.warning(`Pre step failed: ${err.message}`);
  }
}

run();
