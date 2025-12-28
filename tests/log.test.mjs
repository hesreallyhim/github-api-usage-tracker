import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { isQuiet, log, parseBuckets, VALID_BUCKETS } = require('../src/log.js');

const originalQuiet = process.env.INPUT_QUIET;
let stdoutSpy;

describe('log helpers', () => {
  beforeAll(() => {
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  beforeEach(() => {
    stdoutSpy.mockClear();
    delete process.env.INPUT_QUIET;
  });

  afterAll(() => {
    stdoutSpy.mockRestore();
    if (originalQuiet === undefined) {
      delete process.env.INPUT_QUIET;
    } else {
      process.env.INPUT_QUIET = originalQuiet;
    }
  });

  it('treats quiet input as true when set to "true"', () => {
    process.env.INPUT_QUIET = 'true';
    expect(isQuiet()).toBe(true);
    process.env.INPUT_QUIET = 'TRUE';
    expect(isQuiet()).toBe(true);
  });

  it('treats quiet input as false when unset or not "true"', () => {
    delete process.env.INPUT_QUIET;
    expect(isQuiet()).toBe(false);
    process.env.INPUT_QUIET = 'false';
    expect(isQuiet()).toBe(false);
  });

  it('logs when quiet is false', () => {
    process.env.INPUT_QUIET = 'false';
    log('hello');
    const output = stdoutSpy.mock.calls.map((call) => String(call[0])).join('');
    expect(output).toContain('hello');
  });

  it('does not log when quiet is true', () => {
    process.env.INPUT_QUIET = 'true';
    log('quiet');
    expect(stdoutSpy).not.toHaveBeenCalled();
  });

  it('parses valid buckets and warns on invalid ones', () => {
    const result = parseBuckets('core, graphql, invalid_bucket');
    expect(result).toEqual(['core', 'graphql']);
    const output = stdoutSpy.mock.calls.map((call) => String(call[0])).join('');
    expect(output).toContain('Invalid bucket(s) selected: invalid_bucket');
    expect(output).toContain(`valid options are: ${VALID_BUCKETS.join(', ')}`);
  });

  it('normalizes case, trims entries, and drops empty values', () => {
    const result = parseBuckets(' CORE , search , , GraphQL , ');
    expect(result).toEqual(['core', 'search', 'graphql']);
    expect(stdoutSpy).not.toHaveBeenCalled();
  });

  it('accepts non-string input and coerces to a string list', () => {
    const result = parseBuckets(['CORE', 'search', '']);
    expect(result).toEqual(['core', 'search']);
    expect(stdoutSpy).not.toHaveBeenCalled();
  });

  it('returns an empty array without warning for empty input', () => {
    const result = parseBuckets('');
    expect(result).toEqual([]);
    expect(stdoutSpy).not.toHaveBeenCalled();
  });
});
