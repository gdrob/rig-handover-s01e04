# rig

Keeps a lane's lights on while nobody is in it: a heartbeat every minute, a status board, and
(next) a morning digest of what ran overnight.

```sh
cp .env.example .env   # set LANE_MARKER
pnpm install
pnpm dev               # http://localhost:8787
```

Working on it with an agent: start at [AGENTS.md](AGENTS.md).

Export the review page by command, with the lane banner from `.env`:

```sh
pnpm exec tsx --env-file-if-exists=.env scripts/export-preview.ts /absolute/path/outside-repo/index.html
```

The export checks for a complete, self-contained HTML page and refuses destinations inside
the repo. Keep the HTML and `.env` out of Git. Publish only after human approval. Once the
review arrives, export again with `LANE_MARKER` empty and replace the file at the same public
URL after separate approval. Keep the preview issue open until its link reaches the reviewer.
