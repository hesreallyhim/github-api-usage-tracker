# Implementation Notes

## Code Structure

### Separation of module code from test plumbing

The entry point files (`pre.js`, `post.js`, `checkpoint.js`) use a dependency injection pattern to enable unit testing without module mocking. To keep the code readable, each file is organized into two clearly demarcated sections:

```
// ─── CORE LOGIC ──────────────────────────────────────────────────────
async function executePreStep(deps) {
  // The actual business logic lives here.
  // Readers should focus on this section.
}

// ─── TEST HARNESS ────────────────────────────────────────────────────
async function run(overrides = {}) {
  const deps = { core, fetchRateLimit, log, ...overrides };
  return executePreStep(deps);
}

if (require.main === module) run();
module.exports = { run };
```

**Core Logic** (top): Contains the actual business logic in a function that receives a `deps` object. This is what readers should focus on when understanding what the code does.

**Test Harness** (bottom): Contains the dependency injection wiring. The `run(overrides)` function assembles default dependencies and allows tests to substitute mocks via the `overrides` parameter. Readers can skip this section entirely when trying to understand the module's behavior.

This structure mirrors common patterns in other languages (e.g., Python's `if __name__ == '__main__':` at the bottom) and provides a clear "stop reading here" signal for anyone reviewing the logic.

**Note:** Pure utility modules like `post-utils.js` and `log.js` do not use this pattern since they have no external dependencies and can be tested directly.
