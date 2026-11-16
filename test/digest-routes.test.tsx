import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const config = {
  adapter: 'shim',
  installed: '2026-10-29T14:06:00+01:00',
  beatEverySeconds: 60,
  runsDir: '',
};

const tempDirs: string[] = [];

async function createRunsDir() {
  const runsDir = await mkdtemp(join(tmpdir(), 'rig-digest-routes-'));
  tempDirs.push(runsDir);
  return runsDir;
}

async function writeNight(runsDir: string, night: string, contents: string) {
  await mkdir(runsDir, { recursive: true });
  await writeFile(join(runsDir, `${night}.jsonl`), contents, 'utf8');
}

function rowForJob(html: string, job: string) {
  const rows = html.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/g) ?? [];
  return rows.find((row) => row.includes(job));
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('digest routes', () => {
  it('returns the same sorted jobs from the page and JSON, marking retries and failures', async () => {
    const runsDir = await createRunsDir();
    const night = '2026-10-28';
    await writeNight(
      runsDir,
      night,
      [
        JSON.stringify({ at: '2026-10-28T02:10:00-04:00', job: 'zeta', status: 'ok', owner: 'Zoë' }),
        JSON.stringify({ at: '2026-10-28T01:10:00+02:00', job: 'alpha', status: 'retry', owner: null }),
        JSON.stringify({ at: '2026-10-28T01:11:00+02:00', job: 'alpha', status: 'retry', owner: null }),
        JSON.stringify({ at: '2026-10-28T01:12:00+02:00', job: 'alpha', status: 'retry', owner: null }),
        JSON.stringify({ at: '2026-10-28T01:13:00+02:00', job: 'alpha', status: 'retry', owner: null }),
        JSON.stringify({ at: '2026-10-28T01:14:00+02:00', job: 'alpha', status: 'fail', owner: null, error: '<script>alert("x")</script>' }),
      ].join('\n'),
    );

    const app = createApp({ ...config, runsDir });
    const [pageResponse, jsonResponse] = await Promise.all([
      app.request(`/digest/${night}`),
      app.request(`/api/digest/${night}`),
    ]);
    const html = await pageResponse.text();
    const digest = await jsonResponse.json();

    expect(pageResponse.status).toBe(200);
    expect(jsonResponse.status).toBe(200);
    expect(digest).toEqual({
      night,
      rows: [
        {
          job: 'alpha', owner: null, runs: 5, retries: 4, failures: 1, lastStatus: 'fail',
          lastError: '<script>alert("x")</script>', firstAt: '2026-10-28T01:10:00+02:00',
          lastAt: '2026-10-28T01:14:00+02:00',
        },
        {
          job: 'zeta', owner: 'Zoë', runs: 1, retries: 0, failures: 0, lastStatus: 'ok',
          lastError: null, firstAt: '2026-10-28T02:10:00-04:00', lastAt: '2026-10-28T02:10:00-04:00',
        },
      ],
      badLines: 0,
      counts: { ok: 1, retry: 4, fail: 1 },
    });
    expect(html).toContain('alpha');
    expect(html).toContain('zeta');
    expect(html.indexOf('alpha')).toBeLessThan(html.indexOf('zeta'));
    expect(html).toContain('—');
    expect(html).toContain('2026-10-28T01:10:00+02:00');
    expect(html).toContain('2026-10-28T02:10:00-04:00');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>alert');
  });

  it('keeps warnings for three retries or any failure, but not two retries alone', async () => {
    const runsDir = await createRunsDir();
    await writeNight(
      runsDir,
      '2026-10-31',
      [
        JSON.stringify({ at: '2026-10-31T01:00:00+01:00', job: 'three-retries', status: 'retry', owner: 'Ari' }),
        JSON.stringify({ at: '2026-10-31T01:01:00+01:00', job: 'three-retries', status: 'retry', owner: 'Ari' }),
        JSON.stringify({ at: '2026-10-31T01:02:00+01:00', job: 'three-retries', status: 'retry', owner: 'Ari' }),
        JSON.stringify({ at: '2026-10-31T01:03:00+01:00', job: 'three-retries', status: 'ok', owner: 'Ari' }),
        JSON.stringify({ at: '2026-10-31T02:00:00+01:00', job: 'failed-then-ok', status: 'fail', owner: 'Bea', error: 'transient' }),
        JSON.stringify({ at: '2026-10-31T02:01:00+01:00', job: 'failed-then-ok', status: 'ok', owner: 'Bea' }),
        JSON.stringify({ at: '2026-10-31T03:00:00+01:00', job: 'two-retries', status: 'retry', owner: 'Cal' }),
        JSON.stringify({ at: '2026-10-31T03:01:00+01:00', job: 'two-retries', status: 'retry', owner: 'Cal' }),
        JSON.stringify({ at: '2026-10-31T03:02:00+01:00', job: 'two-retries', status: 'ok', owner: 'Cal' }),
      ].join('\n'),
    );
    const response = await createApp({ ...config, runsDir }).request('/digest/2026-10-31');
    const html = await response.text();

    expect(response.status).toBe(200);
    const retriesRow = rowForJob(html, 'three-retries');
    const failureRow = rowForJob(html, 'failed-then-ok');
    const ordinaryRow = rowForJob(html, 'two-retries');
    expect(retriesRow).toBeDefined();
    expect(retriesRow).toContain('class="warn"');
    expect(failureRow).toBeDefined();
    expect(failureRow).toContain('class="warn"');
    expect(ordinaryRow).toBeDefined();
    expect(ordinaryRow).not.toContain('class="warn"');
  });

  it('returns 404 for a missing night on both routes', async () => {
    const app = createApp({ ...config, runsDir: await createRunsDir() });
    const [page, json] = await Promise.all([
      app.request('/digest/2099-01-01'),
      app.request('/api/digest/2099-01-01'),
    ]);

    expect(page.status).toBe(404);
    expect(json.status).toBe(404);
  });

  it('renders an empty night as “nothing ran” and returns zero counts', async () => {
    const runsDir = await createRunsDir();
    await writeNight(runsDir, '2026-10-29', '');
    const app = createApp({ ...config, runsDir });

    const [page, json] = await Promise.all([
      app.request('/digest/2026-10-29'),
      app.request('/api/digest/2026-10-29'),
    ]);

    expect(page.status).toBe(200);
    expect(await page.text()).toContain('nothing ran');
    expect(json.status).toBe(200);
    expect(await json.json()).toEqual({
      night: '2026-10-29', rows: [], badLines: 0, counts: { ok: 0, retry: 0, fail: 0 },
    });
  });

  it('counts bad lines while retaining valid rows for the page and JSON', async () => {
    const runsDir = await createRunsDir();
    await writeNight(
      runsDir,
      '2026-10-30',
      [
        JSON.stringify({ at: '2026-10-30T08:00:00+01:00', job: 'kept-job', status: 'ok', owner: 'Ari' }),
        '{not json',
        JSON.stringify({ at: '2026-10-30T08:05:00+01:00', job: 'also-kept', status: 'retry', owner: null }),
      ].join('\n'),
    );
    const app = createApp({ ...config, runsDir });

    const [page, json] = await Promise.all([
      app.request('/digest/2026-10-30'),
      app.request('/api/digest/2026-10-30'),
    ]);
    const html = await page.text();
    const digest = await json.json();

    expect(page.status).toBe(200);
    expect(json.status).toBe(200);
    expect(digest.badLines).toBe(1);
    expect(digest.rows.map((row: { job: string }) => row.job)).toEqual(['also-kept', 'kept-job']);
    expect(html).toContain('also-kept');
    expect(html).toContain('kept-job');
    expect(html).toContain('1');
  });
});
