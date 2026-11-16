import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, DigestStatus, ReadNight } from './types.js';

type RunEvent = {
  at: string;
  job: string;
  status: DigestStatus;
  owner: string | null;
  error?: string;
};

function isDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(`${value}T00:00:00Z`))
    && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

function isTimestamp(value: string): boolean {
  // Require an explicit offset so chronology does not depend on the server timezone.
  return /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-]([01]\d|2[0-3]):[0-5]\d)$/.test(value)
    && Number.isFinite(Date.parse(value))
    && isDate(value.slice(0, 10));
}

function parseEvent(line: string): RunEvent | null {
  try {
    const value: unknown = JSON.parse(line);
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
    if (!('at' in value) || typeof value.at !== 'string' || !isTimestamp(value.at)) return null;
    if (!('job' in value) || typeof value.job !== 'string' || !value.job.trim()) return null;
    if (!('status' in value) || (value.status !== 'ok' && value.status !== 'retry' && value.status !== 'fail')) return null;
    if (!('owner' in value) || (typeof value.owner !== 'string' && value.owner !== null)) return null;
    if ('error' in value && typeof value.error !== 'string') return null;
    return {
      at: value.at,
      job: value.job,
      status: value.status,
      owner: value.owner,
      ...('error' in value ? { error: value.error as string } : {}),
    };
  } catch {
    return null;
  }
}

export const readNight: ReadNight = (runsDir, night) => {
  // Reject traversal and non-calendar dates before constructing a filesystem path.
  if (!isDate(night)) return null;

  let contents: string;
  try {
    contents = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }

  const lines = contents.split('\n');
  // A terminating newline does not introduce another JSONL record.
  if (lines.at(-1) === '') lines.pop();
  const events: RunEvent[] = [];
  let badLines = 0;
  for (const line of lines) {
    const event = parseEvent(line);
    if (event) events.push(event);
    else badLines++;
  }

  // Stable sorting preserves line order when two events represent the same instant.
  events.sort((left, right) => Date.parse(left.at) - Date.parse(right.at));
  const jobs = new Map<string, DigestRow>();
  const counts = { ok: 0, retry: 0, fail: 0 };
  for (const event of events) {
    counts[event.status]++;
    let row = jobs.get(event.job);
    if (!row) {
      row = {
        job: event.job,
        owner: event.owner,
        runs: 0,
        retries: 0,
        failures: 0,
        lastStatus: event.status,
        lastError: null,
        firstAt: event.at,
        lastAt: event.at,
      };
      jobs.set(event.job, row);
    }
    row.runs++;
    if (event.status === 'retry') row.retries++;
    if (event.status === 'fail') row.failures++;
    row.owner = event.owner;
    row.lastStatus = event.status;
    if (event.error !== undefined) row.lastError = event.error;
    row.lastAt = event.at;
  }

  return {
    night,
    rows: [...jobs.values()].sort((left, right) => left.job < right.job ? -1 : left.job > right.job ? 1 : 0),
    badLines,
    counts,
  };
};
