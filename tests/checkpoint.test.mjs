import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { run } = require('../src/checkpoint.js');

describe('checkpoint step', () => {
  const createCore = () => ({
    getInput: vi.fn(),
    saveState: vi.fn(),
    warning: vi.fn()
  });

  it('skips snapshot when token is missing', async () => {
    const core = createCore();
    core.getInput.mockReturnValue('');
    const fetchRateLimit = vi.fn();
    const log = vi.fn();

    await run({ core, fetchRateLimit, log });

    expect(log).toHaveBeenCalledWith(
      '[github-api-usage-tracker] Skipping checkpoint snapshot due to missing token'
    );
    expect(fetchRateLimit).not.toHaveBeenCalled();
    expect(core.saveState).not.toHaveBeenCalled();
  });

  it('stores checkpoint snapshot when token is present', async () => {
    const now = new Date('2024-01-01T00:00:05Z');
    vi.useFakeTimers();
    vi.setSystemTime(now);

    const core = createCore();
    core.getInput.mockReturnValue('token');
    const fetchRateLimit = vi.fn().mockResolvedValue({
      resources: { core: { remaining: 4 } }
    });
    const log = vi.fn();

    await run({ core, fetchRateLimit, log });

    expect(core.saveState).toHaveBeenCalledWith('checkpoint_time', String(now.getTime()));
    expect(core.saveState).toHaveBeenCalledWith(
      'checkpoint_rate_limits',
      JSON.stringify({ core: { remaining: 4 } })
    );
    expect(fetchRateLimit).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalled();

    vi.useRealTimers();
  });

  it('warns when checkpoint fetch fails', async () => {
    const core = createCore();
    core.getInput.mockReturnValue('token');
    const fetchRateLimit = vi.fn().mockRejectedValue(new Error('boom'));
    const log = vi.fn();

    await run({ core, fetchRateLimit, log });

    expect(core.warning).toHaveBeenCalledWith(
      '[github-api-usage-tracker] Main step snapshot failed: boom'
    );
  });
});
