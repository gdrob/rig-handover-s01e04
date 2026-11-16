export type DigestStatus = 'ok' | 'retry' | 'fail';

export type DigestRow = {
  job: string;
  owner: string | null;
  runs: number;
  retries: number;
  // Counts every failed event, even when a later event succeeds.
  failures: number;
  lastStatus: DigestStatus;
  lastError: string | null;
  // Keep the timestamps and their offsets exactly as recorded in the log.
  firstAt: string;
  lastAt: string;
};

// Counts valid log events, rather than each job's final status.
export type DigestCounts = Record<DigestStatus, number>;

export type NightDigest = {
  night: string;
  // One row per job, sorted by job name.
  rows: DigestRow[];
  badLines: number;
  counts: DigestCounts;
};

// Implemented as readNight in read-night.ts. Missing files return null; an empty
// file returns a digest with no rows, no bad lines, and zero event counts.
export type ReadNight = (runsDir: string, night: string) => NightDigest | null;
