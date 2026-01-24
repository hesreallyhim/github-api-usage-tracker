import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  formatMs,
  makeSummaryTable,
  computeBucketUsage,
  getUsageWarningMessage,
  buildBucketData
} = require('../src/post-utils.js');

describe('post utils', () => {
  it('formats sub-minute durations in seconds', () => {
    expect(formatMs(59000)).toBe('59s');
  });

  it('formats minute durations with minutes and seconds', () => {
    expect(formatMs(60000)).toBe('1m 0s');
    expect(formatMs(59 * 60 * 1000 + 59 * 1000)).toBe('59m 59s');
  });

  it('formats hour durations with hours, minutes, and seconds', () => {
    expect(formatMs(60 * 60 * 1000)).toBe('1h 0m 0s');
    expect(formatMs(60 * 60 * 1000 + 61 * 1000)).toBe('1h 1m 1s');
    expect(formatMs(60 * 60 * 1000 + 60 * 1000 + 1000)).toBe('1h 1m 1s');
  });

  it('builds a summary table with stringified counts', () => {
    const table = makeSummaryTable({
      core: {
        used: { start: 3, end: 5, total: 2 },
        remaining: { start: 10, end: 8 }
      },
      search: {
        used: { start: 1, end: 1, total: 0 },
        remaining: { start: 2, end: 2 }
      }
    });

    expect(table).toEqual([
      [
        { data: 'Bucket', header: true },
        { data: 'Used (Start)', header: true },
        { data: 'Remaining (Start)', header: true },
        { data: 'Used (End)', header: true },
        { data: 'Remaining (End)', header: true },
        { data: 'Used (Total)', header: true }
      ],
      [
        { data: 'core' },
        { data: '3' },
        { data: '10' },
        { data: '5' },
        { data: '8' },
        { data: '2' }
      ],
      [
        { data: 'search' },
        { data: '1' },
        { data: '2' },
        { data: '1' },
        { data: '2' },
        { data: '0' }
      ]
    ]);
  });

  it('uses minimum header when option is set', () => {
    const table = makeSummaryTable(
      { core: { used: { start: 1, end: 2, total: 1 }, remaining: { start: 10, end: 9 } } },
      { useMinimumHeader: true }
    );
    expect(table[0][5]).toEqual({ data: 'Used (Minimum)', header: true });
  });

  it('formats non-numeric values as n/a', () => {
    const table = makeSummaryTable({
      core: {
        used: { start: null, end: undefined, total: NaN },
        remaining: { start: undefined, end: null }
      }
    });
    expect(table[1]).toEqual([
      { data: 'core' },
      { data: 'n/a' },
      { data: 'n/a' },
      { data: 'n/a' },
      { data: 'n/a' },
      { data: 'n/a' }
    ]);
  });

  it('handles missing usage info in rows', () => {
    const table = makeSummaryTable({ core: {} });
    expect(table[1]).toEqual([
      { data: 'core' },
      { data: 'n/a' },
      { data: 'n/a' },
      { data: 'n/a' },
      { data: 'n/a' },
      { data: 'n/a' }
    ]);
  });
});

describe('computeBucketUsage', () => {
  it('returns missing_bucket error when starting bucket is null', () => {
    const result = computeBucketUsage(null, { limit: 10, remaining: 9 }, 1200);
    expect(result).toEqual({
      valid: false,
      used: 0,
      remaining: undefined,
      crossed_reset: false,
      warnings: [],
      reason: 'missing_bucket'
    });
  });

  it('returns invalid_remaining error for non-numeric remaining', () => {
    const result = computeBucketUsage(
      { limit: 10, remaining: 'nope', reset: 1600 },
      { limit: 10, remaining: 9 },
      1200
    );
    expect(result).toEqual({
      valid: false,
      used: 0,
      remaining: undefined,
      crossed_reset: false,
      warnings: [],
      reason: 'invalid_remaining'
    });
  });

  it('returns invalid_limit error when crossed reset with invalid limits', () => {
    const result = computeBucketUsage(
      { limit: 'nope', remaining: 5, reset: 100 },
      { limit: 10, remaining: 3 },
      1200
    );
    expect(result).toEqual({
      valid: false,
      used: 0,
      remaining: undefined,
      crossed_reset: true,
      warnings: [],
      reason: 'invalid_limit'
    });
  });

  it('returns negative_usage error when usage is negative across reset', () => {
    const result = computeBucketUsage(
      { limit: 10, remaining: 5, reset: 100 },
      { limit: 10, remaining: 20 },
      1200
    );
    expect(result).toEqual({
      valid: false,
      used: 0,
      remaining: undefined,
      crossed_reset: true,
      warnings: [],
      reason: 'negative_usage'
    });
  });

  it('computes usage within the same window', () => {
    const result = computeBucketUsage(
      { limit: 1000, remaining: 900, reset: 1600 },
      { limit: 1000, remaining: 850 },
      1200
    );

    expect(result).toEqual({
      valid: true,
      used: 50,
      remaining: 850,
      crossed_reset: false,
      warnings: []
    });
  });

  it('marks remaining increases without reset as invalid', () => {
    const result = computeBucketUsage(
      { limit: 1000, remaining: 800, reset: 1600 },
      { limit: 1000, remaining: 900 },
      1200
    );

    expect(result).toEqual({
      valid: false,
      used: 0,
      remaining: undefined,
      crossed_reset: false,
      warnings: [],
      reason: 'remaining_increased_without_reset'
    });
  });

  it('computes usage when a reset window is crossed', () => {
    const result = computeBucketUsage(
      { limit: 1000, remaining: 700, reset: 1100 },
      { limit: 1000, remaining: 900 },
      1300
    );

    expect(result).toEqual({
      valid: true,
      used: 100,
      remaining: 900,
      crossed_reset: true,
      warnings: []
    });
  });

  it('adds checkpoint usage before reset to the minimum', () => {
    const result = computeBucketUsage(
      { limit: 1000, remaining: 700, reset: 1100 },
      { limit: 1000, remaining: 900 },
      1300,
      { limit: 1000, remaining: 650 },
      1000
    );

    expect(result).toEqual({
      valid: true,
      used: 150,
      remaining: 900,
      crossed_reset: true,
      warnings: []
    });
  });

  it('ignores checkpoint when remaining is non-numeric', () => {
    const result = computeBucketUsage(
      { limit: 10, remaining: 5, reset: 100 },
      { limit: 10, remaining: 7 },
      200,
      { limit: 10, remaining: 'nope' },
      50
    );
    expect(result).toEqual({
      valid: true,
      used: 3,
      remaining: 7,
      crossed_reset: true,
      warnings: []
    });
  });

  it('does not add checkpoint usage when usage is not positive', () => {
    const result = computeBucketUsage(
      { limit: 10, remaining: 5, reset: 100 },
      { limit: 10, remaining: 7 },
      200,
      { limit: 10, remaining: 6 },
      50
    );
    expect(result).toEqual({
      valid: true,
      used: 3,
      remaining: 7,
      crossed_reset: true,
      warnings: []
    });
  });

  it('warns when limits change across a reset', () => {
    const result = computeBucketUsage(
      { limit: 1000, remaining: 600, reset: 1100 },
      { limit: 5000, remaining: 4700 },
      1300
    );

    expect(result).toEqual({
      valid: true,
      used: 300,
      remaining: 4700,
      crossed_reset: true,
      warnings: ['limit_changed_across_reset']
    });
  });

  it('marks limit changes mid-window as invalid', () => {
    const result = computeBucketUsage(
      { limit: 1000, remaining: 950, reset: 1600 },
      { limit: 5000, remaining: 4900 },
      1200
    );

    expect(result).toEqual({
      valid: false,
      used: 0,
      remaining: undefined,
      crossed_reset: false,
      warnings: [],
      reason: 'limit_changed_without_reset'
    });
  });
});

describe('getUsageWarningMessage', () => {
  const bucket = 'core';
  const prefix = '[github-api-usage-tracker]';

  it('returns message for invalid_remaining', () => {
    expect(getUsageWarningMessage('invalid_remaining', bucket)).toBe(
      `${prefix} Invalid remaining count for bucket "core"; skipping`
    );
  });

  it('returns message for invalid_limit', () => {
    expect(getUsageWarningMessage('invalid_limit', bucket)).toBe(
      `${prefix} Invalid limit for bucket "core" during reset crossing; skipping`
    );
  });

  it('returns message for limit_changed_without_reset', () => {
    expect(getUsageWarningMessage('limit_changed_without_reset', bucket)).toBe(
      `${prefix} Limit changed without reset for bucket "core"; skipping`
    );
  });

  it('returns message for remaining_increased_without_reset', () => {
    expect(getUsageWarningMessage('remaining_increased_without_reset', bucket)).toBe(
      `${prefix} Remaining increased without reset for bucket "core"; skipping`
    );
  });

  it('returns message for negative_usage', () => {
    expect(getUsageWarningMessage('negative_usage', bucket)).toBe(
      `${prefix} Negative usage for bucket "core" detected; skipping`
    );
  });

  it('returns default message for unknown reason', () => {
    expect(getUsageWarningMessage('unknown_reason', bucket)).toBe(
      `${prefix} Invalid usage data for bucket "core"; skipping`
    );
  });
});

describe('buildBucketData', () => {
  it('builds data object with valid numeric values', () => {
    const startingBucket = { limit: 1000, remaining: 900 };
    const endingBucket = { limit: 1000, remaining: 850 };
    const usage = { used: 50, crossed_reset: false };

    expect(buildBucketData(startingBucket, endingBucket, usage)).toEqual({
      used: { start: 100, end: 150, total: 50 },
      remaining: { start: 900, end: 850 },
      crossed_reset: false
    });
  });

  it('returns null for non-numeric values', () => {
    const startingBucket = { limit: 'invalid', remaining: 900 };
    const endingBucket = { limit: 1000, remaining: 'bad' };
    const usage = { used: 50, crossed_reset: true };

    expect(buildBucketData(startingBucket, endingBucket, usage)).toEqual({
      used: { start: null, end: null, total: 50 },
      remaining: { start: 900, end: null },
      crossed_reset: true
    });
  });
});
