import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { formatMs, makeSummaryTable, computeBucketUsage } = require('../src/post-utils.js');

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
        used_start: 3,
        remaining_start: 10,
        used_end: 5,
        remaining_end: 8,
        used_total: 2
      },
      search: {
        used_start: 1,
        remaining_start: 2,
        used_end: 1,
        remaining_end: 2,
        used_total: 0
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
});

describe('computeBucketUsage', () => {
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
