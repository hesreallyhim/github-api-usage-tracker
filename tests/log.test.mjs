import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { log, parseBuckets, VALID_BUCKETS } = require('../src/log.js');
let stdoutSpy;

describe('log helpers', () => {
  beforeAll(() => {
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  beforeEach(() => {
    stdoutSpy.mockClear();
  });

  afterAll(() => {
    stdoutSpy.mockRestore();
  });

  it('logs using core.debug', () => {
    log('hello');
    const output = stdoutSpy.mock.calls.map((call) => String(call[0])).join('');
    expect(output).toContain('::debug::hello');
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
