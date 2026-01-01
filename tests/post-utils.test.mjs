import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { formatMs, makeSummaryTable } = require('../src/post-utils.js');

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
      core: { used: 3, remaining: 10 },
      search: { used: 1, remaining: 2 }
    });

    expect(table).toEqual([
      [
        { data: 'Bucket', header: true },
        { data: 'Used', header: true },
        { data: 'Remaining', header: true }
      ],
      [{ data: 'core' }, { data: '3' }, { data: '10' }],
      [{ data: 'search' }, { data: '1' }, { data: '2' }]
    ]);
  });
});
