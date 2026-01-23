import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { run, maybeWrite } = require('../src/post.js');

const createSummary = () => {
  const calls = { headings: [], tables: [], raws: [], writes: 0 };
  const summary = {
    addHeading(text) {
      calls.headings.push(text);
      return summary;
    },
    addTable(table) {
      calls.tables.push(table);
      return summary;
    },
    addRaw(html, escape) {
      calls.raws.push({ html, escape });
      return summary;
    },
    write() {
      calls.writes += 1;
      return summary;
    }
  };
  return { summary, calls };
};

const createCore = ({ inputs = {}, state = {} } = {}) => {
  const { summary, calls } = createSummary();
  const core = {
    getInput: vi.fn((key) => inputs[key]),
    getState: vi.fn((key) => state[key]),
    setOutput: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    summary
  };
  return { core, summaryCalls: calls };
};

describe('post step', () => {
  it('writes output without creating a directory for current paths', () => {
    const fsStub = { mkdirSync: vi.fn(), writeFileSync: vi.fn() };
    const pathStub = { dirname: vi.fn().mockReturnValue('.') };

    maybeWrite('usage.json', { ok: true }, fsStub, pathStub);

    expect(fsStub.mkdirSync).not.toHaveBeenCalled();
    expect(fsStub.writeFileSync).toHaveBeenCalledWith(
      'usage.json',
      JSON.stringify({ ok: true }, null, 2)
    );
  });

  it('skips when skip_post is true', async () => {
    const { core } = createCore({ state: { skip_post: 'true' } });
    const log = vi.fn();
    const parseBuckets = vi.fn();
    const fetchRateLimit = vi.fn();

    await run({ core, log, parseBuckets, fetchRateLimit });

    expect(log).toHaveBeenCalledWith(
      '[github-api-usage-tracker] Skipping post step due to missing token'
    );
    expect(parseBuckets).not.toHaveBeenCalled();
    expect(fetchRateLimit).not.toHaveBeenCalled();
  });

  it('returns early when no valid buckets are provided', async () => {
    const { core } = createCore({ inputs: { buckets: 'core' } });
    const log = vi.fn();
    const parseBuckets = vi.fn().mockReturnValue([]);
    const fetchRateLimit = vi.fn();

    await run({ core, log, parseBuckets, fetchRateLimit });

    expect(log).toHaveBeenCalledWith(
      '[github-api-usage-tracker] No valid buckets specified for tracking'
    );
    expect(fetchRateLimit).not.toHaveBeenCalled();
  });

  it('errors when starting state is missing', async () => {
    const { core } = createCore({ inputs: { buckets: 'core' } });
    const log = vi.fn();
    const parseBuckets = vi.fn().mockReturnValue(['core']);
    const fetchRateLimit = vi.fn();

    await run({ core, log, parseBuckets, fetchRateLimit });

    expect(core.error).toHaveBeenCalledWith(
      '[github-api-usage-tracker] No starting rate limit data found; skipping post step'
    );
    expect(fetchRateLimit).not.toHaveBeenCalled();
  });

  it('errors when starting state is invalid JSON', async () => {
    const { core } = createCore({
      inputs: { buckets: 'core' },
      state: { starting_rate_limits: '{', start_time: '0' }
    });
    const log = vi.fn();
    const parseBuckets = vi.fn().mockReturnValue(['core']);
    const fetchRateLimit = vi.fn();

    await run({ core, log, parseBuckets, fetchRateLimit });

    expect(core.error).toHaveBeenCalledWith(
      '[github-api-usage-tracker] Failed to parse starting rate limit data; skipping post step'
    );
    expect(fetchRateLimit).not.toHaveBeenCalled();
  });

  it('handles missing buckets and invalid usage reasons', async () => {
    const buckets = [
      'missingStart',
      'missingEnd',
      'invalid_limit',
      'limit_changed_without_reset',
      'remaining_increased_without_reset',
      'negative_usage',
      'unknown_reason'
    ];
    const startingResources = {
      missingEnd: {},
      invalid_limit: {},
      limit_changed_without_reset: {},
      remaining_increased_without_reset: {},
      negative_usage: {},
      unknown_reason: {}
    };
    const endingResources = {
      invalid_limit: {},
      limit_changed_without_reset: {},
      remaining_increased_without_reset: {},
      negative_usage: {},
      unknown_reason: {}
    };
    const { core } = createCore({
      inputs: { buckets: buckets.join(',') },
      state: {
        starting_rate_limits: JSON.stringify(startingResources),
        start_time: '0'
      }
    });
    const log = vi.fn();
    const parseBuckets = vi.fn().mockReturnValue(buckets);
    const fetchRateLimit = vi.fn().mockResolvedValue({ resources: endingResources });
    const results = [
      { valid: false, reason: 'invalid_limit', warnings: [] },
      { valid: false, reason: 'limit_changed_without_reset', warnings: [] },
      { valid: false, reason: 'remaining_increased_without_reset', warnings: [] },
      { valid: false, reason: 'negative_usage', warnings: [] },
      { valid: false, reason: 'whatever', warnings: [] }
    ];
    const computeBucketUsage = vi.fn(() => results.shift());

    await run({ core, log, parseBuckets, fetchRateLimit, computeBucketUsage });

    expect(core.warning).toHaveBeenCalledWith(
      '[github-api-usage-tracker] Starting rate limit bucket "missingStart" not found; skipping'
    );
    expect(core.warning).toHaveBeenCalledWith(
      '[github-api-usage-tracker] Ending rate limit bucket "missingEnd" not found; skipping'
    );
    expect(core.warning).toHaveBeenCalledWith(
      '[github-api-usage-tracker] Invalid limit for bucket "invalid_limit" during reset crossing; skipping'
    );
    expect(core.warning).toHaveBeenCalledWith(
      '[github-api-usage-tracker] Limit changed without reset for bucket "limit_changed_without_reset"; skipping'
    );
    expect(core.warning).toHaveBeenCalledWith(
      '[github-api-usage-tracker] Remaining increased without reset for bucket "remaining_increased_without_reset"; skipping'
    );
    expect(core.warning).toHaveBeenCalledWith(
      '[github-api-usage-tracker] Negative usage for bucket "negative_usage" detected; skipping'
    );
    expect(core.warning).toHaveBeenCalledWith(
      '[github-api-usage-tracker] Invalid usage data for bucket "unknown_reason"; skipping'
    );
  });

  it('reports unknown duration when start time is invalid', async () => {
    const { core, summaryCalls } = createCore({
      inputs: { buckets: 'core' },
      state: {
        starting_rate_limits: JSON.stringify({
          core: { limit: 10, remaining: 7, reset: 9999 }
        }),
        start_time: 'nope',
        checkpoint_rate_limits: 'not-json'
      }
    });
    const log = vi.fn();
    const parseBuckets = vi.fn().mockReturnValue(['core']);
    const fetchRateLimit = vi.fn().mockResolvedValue({
      resources: { core: { limit: 10, remaining: 5, reset: 9999 } }
    });
    const computeBucketUsage = vi.fn().mockReturnValue({
      valid: true,
      used: 2,
      crossed_reset: false,
      warnings: []
    });

    await run({ core, log, parseBuckets, fetchRateLimit, computeBucketUsage });

    expect(core.error).toHaveBeenCalledWith(
      '[github-api-usage-tracker] Invalid or missing start time; duration will be reported as unknown'
    );
    expect(core.warning).toHaveBeenCalledWith(
      '[github-api-usage-tracker] Failed to parse checkpoint rate limit data; ignoring checkpoint snapshot'
    );
    expect(summaryCalls.raws.some((entry) => entry.html.includes('Unknown (data missing)'))).toBe(
      true
    );
    expect(
      summaryCalls.raws.some((entry) => entry.html.includes('Total API Calls/Points Used'))
    ).toBe(true);
  });

  it('reports errors when post step throws', async () => {
    const { core } = createCore({
      inputs: { buckets: 'core' },
      state: {
        starting_rate_limits: JSON.stringify({ core: { limit: 10, remaining: 7, reset: 9999 } }),
        start_time: '0'
      }
    });
    const log = vi.fn();
    const parseBuckets = vi.fn().mockReturnValue(['core']);
    const fetchRateLimit = vi.fn().mockRejectedValue(new Error('boom'));

    await run({ core, log, parseBuckets, fetchRateLimit });

    expect(core.error).toHaveBeenCalledWith('[github-api-usage-tracker] Post step failed: boom');
  });

  it('writes output and summary with checkpoint data', async () => {
    const startTime = new Date('2024-01-01T00:00:00Z');
    const endTime = new Date('2024-01-01T00:00:10Z');
    vi.useFakeTimers();
    vi.setSystemTime(endTime);

    const startingResources = {
      core: { limit: 10, remaining: 8, reset: 20 },
      search: { limit: 5, remaining: 4, reset: 20 }
    };
    const endingResources = {
      core: { limit: 10, remaining: 5, reset: 20 },
      search: { limit: 5, remaining: 4, reset: 20 }
    };
    const checkpointResources = {
      core: { limit: 10, remaining: 7, reset: 20 },
      search: { limit: 5, remaining: 4, reset: 20 }
    };
    const { core, summaryCalls } = createCore({
      inputs: { buckets: 'core,search', output_path: 'out/usage.json' },
      state: {
        starting_rate_limits: JSON.stringify(startingResources),
        start_time: String(startTime.getTime()),
        checkpoint_rate_limits: JSON.stringify(checkpointResources),
        checkpoint_time: String(startTime.getTime() + 5000)
      }
    });
    const log = vi.fn();
    const parseBuckets = vi.fn().mockReturnValue(['core', 'search']);
    const fetchRateLimit = vi.fn().mockResolvedValue({ resources: endingResources });
    const usageResults = [
      {
        valid: true,
        used: 3,
        crossed_reset: true,
        warnings: ['limit_changed_across_reset']
      },
      { valid: false, reason: 'invalid_remaining', warnings: [] }
    ];
    const computeBucketUsage = vi.fn(() => usageResults.shift());
    const fsStub = { mkdirSync: vi.fn(), writeFileSync: vi.fn() };
    const pathStub = { dirname: (p) => path.dirname(p) };

    await run({
      core,
      log,
      parseBuckets,
      fetchRateLimit,
      computeBucketUsage,
      fs: fsStub,
      path: pathStub
    });

    expect(parseBuckets).toHaveBeenCalledWith('core,search');
    expect(fetchRateLimit).toHaveBeenCalledTimes(1);
    expect(computeBucketUsage).toHaveBeenCalledTimes(2);
    expect(core.warning).toHaveBeenCalledWith(
      '[github-api-usage-tracker] Limit changed across reset for bucket "core"; results may reflect a token change'
    );
    expect(core.warning).toHaveBeenCalledWith(
      '[github-api-usage-tracker] Invalid remaining count for bucket "search"; skipping'
    );
    expect(core.setOutput).toHaveBeenCalledTimes(1);
    const output = JSON.parse(core.setOutput.mock.calls[0][1]);
    expect(output.total).toBe(3);
    expect(output.crossed_reset).toBe(true);
    expect(output.buckets_data.core.used.total).toBe(3);
    expect(fsStub.mkdirSync).toHaveBeenCalledWith('out', { recursive: true });
    expect(fsStub.writeFileSync).toHaveBeenCalled();

    expect(summaryCalls.headings).toContain('GitHub API Usage Tracker Summary');
    expect(summaryCalls.tables).toHaveLength(1);
    expect(summaryCalls.raws.some((entry) => entry.html.includes('Reset Window Crossed'))).toBe(
      true
    );
    expect(
      summaryCalls.raws.some((entry) => entry.html.includes('Minimum API Calls/Points Used'))
    ).toBe(true);
    expect(summaryCalls.raws.some((entry) => entry.html.includes('Action Duration'))).toBe(true);
    expect(summaryCalls.raws.some((entry) => entry.html.includes('10s'))).toBe(true);
    expect(summaryCalls.writes).toBe(1);

    vi.useRealTimers();
  });
});
