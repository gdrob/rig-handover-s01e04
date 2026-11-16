import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read-night.js';

const night = '2026-10-28';
const event = { at: '2026-10-29T01:00:00+01:00', job: 'job', status: 'ok', owner: 'rook' };
let runsDir: string;

beforeEach(() => { runsDir = mkdtempSync(join(tmpdir(), 'rig-reader-')); });
afterEach(() => { rmSync(runsDir, { recursive: true, force: true }); });

function writeEvents(events: unknown[]) {
  writeFileSync(join(runsDir, `${night}.jsonl`), events.map(value => JSON.stringify(value)).join('\n'));
}

describe('readNight', () => {
  it('reads the real fixture without losing null owners or recovered errors', () => {
    const digest = readNight('runs', night)!;
    expect(digest.badLines).toBe(1);
    expect(digest.counts).toEqual({ ok: 10, retry: 4, fail: 1 });
    expect(digest.rows.map(row => row.job)).toEqual([
      'digest/render', 'fixtures/refresh', 'lane/sync', 'notes/backup', 'rig/rotate-logs',
    ]);
    expect(digest.rows[0].owner).toBeNull();
    expect(digest.rows[1]).toEqual({
      job: 'fixtures/refresh', owner: 'rook', runs: 4, retries: 3, failures: 0,
      lastStatus: 'ok', lastError: 'upstream 503',
      firstAt: '2026-10-29T01:30:00+01:00', lastAt: '2026-10-29T01:37:00+01:00',
    });
    expect(digest.rows[3]).toMatchObject({ failures: 1, lastStatus: 'fail', lastError: 'quota exceeded' });
  });

  it('returns null for a missing file and a zero digest for an empty file', () => {
    expect(readNight(runsDir, night)).toBeNull();
    writeFileSync(join(runsDir, `${night}.jsonl`), '');
    expect(readNight(runsDir, night)).toEqual({ night, rows: [], badLines: 0, counts: { ok: 0, retry: 0, fail: 0 } });
  });

  it('counts malformed JSON and invalid event shapes, continuing to valid records', () => {
    const invalid = [
      null, [], 2, 'text', {},
      { ...event, at: 1 }, { ...event, at: 'not a time' },
      { ...event, at: '2026-02-30T01:00:00Z' }, { ...event, at: '2026-10-28T01:00:00' },
      { ...event, job: 1 }, { ...event, job: '  ' },
      { ...event, status: 'unknown' }, { ...event, status: ['ok'] },
      { ...event, owner: 1 }, { ...event, owner: undefined },
      { ...event, error: null }, { ...event, error: 7 },
    ];
    writeFileSync(join(runsDir, `${night}.jsonl`), [
      '{broken', ...invalid.map(value => JSON.stringify(value)), JSON.stringify({ ...event, owner: null }), '',
    ].join('\n'));
    const digest = readNight(runsDir, night)!;
    expect(digest.badLines).toBe(invalid.length + 1);
    expect(digest.rows).toHaveLength(1);
    expect(digest.rows[0]).toMatchObject({ owner: null, runs: 1 });
    expect(digest.counts).toEqual({ ok: 1, retry: 0, fail: 0 });
  });

  it('counts interior blank lines but not a final newline', () => {
    writeFileSync(join(runsDir, `${night}.jsonl`), `${JSON.stringify(event)}\r\n\r\n${JSON.stringify(event)}\r\n`);
    expect(readNight(runsDir, night)).toMatchObject({ badLines: 1, counts: { ok: 2, retry: 0, fail: 0 } });
  });

  it('retains the latest supplied error through recovery and counts all events', () => {
    writeEvents([
      { ...event, at: '2026-10-29T01:00:00Z', status: 'fail', error: 'first' },
      { ...event, at: '2026-10-29T01:01:00Z', status: 'retry', error: 'latest' },
      { ...event, at: '2026-10-29T01:02:00Z', owner: null },
    ]);
    expect(readNight(runsDir, night)).toMatchObject({
      counts: { ok: 1, retry: 1, fail: 1 },
      rows: [{ runs: 3, retries: 1, failures: 1, owner: null, lastStatus: 'ok', lastError: 'latest' }],
    });
  });

  it('uses event chronology across offsets, retaining original timestamps and stable ties', () => {
    writeEvents([
      { ...event, at: '2026-10-29T02:00:00+01:00', status: 'ok', owner: 'last' },
      { ...event, at: '2026-10-29T00:45:00Z', status: 'retry', error: 'new error' },
      { ...event, at: '2026-10-29T02:30:00+02:00', status: 'fail', error: 'old error' },
      { ...event, at: '2026-10-29T01:00:00Z', status: 'retry', owner: null },
    ]);
    expect(readNight(runsDir, night)!.rows[0]).toEqual({
      job: 'job', owner: null, runs: 4, retries: 2, failures: 1,
      lastStatus: 'retry', lastError: 'new error',
      firstAt: '2026-10-29T02:30:00+02:00', lastAt: '2026-10-29T01:00:00Z',
    });
  });

  it.each(['../2026-10-28', '/2026-10-28', '2026-10-28/../2026-10-28', '2026-10-28.jsonl', '2026-02-30', '2026-13-01', '2026-10-28\u0000'])('rejects unsafe or invalid night %s', value => {
    writeEvents([event]);
    expect(readNight(runsDir, value)).toBeNull();
  });
});
