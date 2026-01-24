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

---

## Update: Pattern Reverted (2026-01-23)

The dependency injection pattern described above was reverted. Investigation revealed:

1. **Root cause**: Vitest's `vi.mock()` does not intercept `require()` calls in CommonJS modules. The DI pattern was a workaround for this Vitest limitation.

2. **Coverage before DI**: 36% (entry points at 0%)
3. **Coverage after DI**: 99%

However, the 0% coverage on entry points was partly because we hadn't attempted to test them via other means. The new approach:

- **Extract pure logic** into utility modules (`post-utils.js`) where it can be tested directly
- **Keep entry points thin** - just orchestration/wiring
- **Integration test** entry points via `act` (local GitHub Actions runner) if needed

This follows the "functional core, imperative shell" pattern and avoids shaping production code around testing infrastructure limitations.
