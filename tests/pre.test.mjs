import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { run } = require('../src/pre.js');

describe('pre step', () => {
  const createCore = () => ({
    getInput: vi.fn(),
    saveState: vi.fn(),
    error: vi.fn(),
    warning: vi.fn()
  });

  it('marks skip_post when token is missing', async () => {
    const core = createCore();
    core.getInput.mockReturnValue('');
    const fetchRateLimit = vi.fn();
    const log = vi.fn();

    await run({ core, fetchRateLimit, log });

    expect(core.error).toHaveBeenCalledWith('GitHub token is required for API Usage Tracker');
    expect(core.saveState).toHaveBeenCalledWith('skip_post', 'true');
    expect(fetchRateLimit).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });

  it('stores starting snapshot when token is present', async () => {
    const now = new Date('2024-01-01T00:00:00Z');
    vi.useFakeTimers();
    vi.setSystemTime(now);

    const core = createCore();
    core.getInput.mockReturnValue('token');
    const fetchRateLimit = vi.fn().mockResolvedValue({
      resources: { core: { remaining: 5 } }
    });
    const log = vi.fn();

    await run({ core, fetchRateLimit, log });

    expect(core.saveState).toHaveBeenCalledWith('start_time', String(now.getTime()));
    expect(core.saveState).toHaveBeenCalledWith(
      'starting_rate_limits',
      JSON.stringify({ core: { remaining: 5 } })
    );
    expect(fetchRateLimit).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalled();

    vi.useRealTimers();
  });

  it('warns when rate limit fetch fails', async () => {
    const core = createCore();
    core.getInput.mockReturnValue('token');
    const fetchRateLimit = vi.fn().mockRejectedValue(new Error('boom'));
    const log = vi.fn();

    await run({ core, fetchRateLimit, log });

    expect(core.warning).toHaveBeenCalledWith('Pre step failed: boom');
  });
});
