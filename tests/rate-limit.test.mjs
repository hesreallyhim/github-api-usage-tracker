import { describe, it, expect, beforeEach, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { EventEmitter } from 'events';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const https = require('https');

const { fetchRateLimit } = require('../src/rate-limit.js');

const originalToken = process.env.INPUT_TOKEN;
let stdoutSpy;
let requestSpy;

describe('fetchRateLimit', () => {
  beforeAll(() => {
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  beforeEach(() => {
    stdoutSpy.mockClear();
    delete process.env.INPUT_TOKEN;
  });

  afterEach(() => {
    if (requestSpy) {
      requestSpy.mockRestore();
      requestSpy = undefined;
    }
  });

  afterAll(() => {
    stdoutSpy.mockRestore();
    if (originalToken === undefined) {
      delete process.env.INPUT_TOKEN;
    } else {
      process.env.INPUT_TOKEN = originalToken;
    }
  });

  it('rejects when no token is provided', async () => {
    requestSpy = vi.spyOn(https, 'request').mockImplementation(() => {
      const req = new EventEmitter();
      req.end = () => {};
      return req;
    });
    await expect(fetchRateLimit()).rejects.toThrow('No GitHub token provided');
    expect(requestSpy).not.toHaveBeenCalled();
  });

  it('returns parsed JSON on success', async () => {
    process.env.INPUT_TOKEN = 'token123';
    requestSpy = vi.spyOn(https, 'request').mockImplementation((options, callback) => {
      const req = new EventEmitter();
      req.end = () => {
        const res = new EventEmitter();
        res.statusCode = 200;
        callback(res);
        res.emit('data', JSON.stringify({ resources: { core: { used: 1, remaining: 2 } } }));
        res.emit('end');
      };
      return req;
    });

    const result = await fetchRateLimit();
    expect(result.resources.core.used).toBe(1);
    expect(requestSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        hostname: 'api.github.com',
        path: '/rate_limit',
        headers: expect.objectContaining({
          Authorization: 'Bearer token123'
        })
      }),
      expect.any(Function)
    );
  });

  it('rejects on non-2xx responses', async () => {
    process.env.INPUT_TOKEN = 'token123';
    requestSpy = vi.spyOn(https, 'request').mockImplementation((options, callback) => {
      const req = new EventEmitter();
      req.end = () => {
        const res = new EventEmitter();
        res.statusCode = 401;
        callback(res);
        res.emit('data', 'nope');
        res.emit('end');
      };
      return req;
    });

    await expect(fetchRateLimit()).rejects.toThrow('GitHub API returned 401: nope');
  });

  it('rejects on invalid JSON payloads', async () => {
    process.env.INPUT_TOKEN = 'token123';
    requestSpy = vi.spyOn(https, 'request').mockImplementation((options, callback) => {
      const req = new EventEmitter();
      req.end = () => {
        const res = new EventEmitter();
        res.statusCode = 200;
        callback(res);
        res.emit('data', 'not-json');
        res.emit('end');
      };
      return req;
    });

    await expect(fetchRateLimit()).rejects.toThrow();
  });

  it('rejects on request errors', async () => {
    process.env.INPUT_TOKEN = 'token123';
    requestSpy = vi.spyOn(https, 'request').mockImplementation(() => {
      const req = new EventEmitter();
      req.end = () => {
        req.emit('error', new Error('network down'));
      };
      return req;
    });

    await expect(fetchRateLimit()).rejects.toThrow('network down');
  });
});
