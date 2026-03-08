# Q

Async task queue for Claude Code. A worker daemon drains the queue when Claude quota is available, running Claude Code CLI sessions per ticket via isolated project containers, streaming output to the browser in real time via SSE.

## Architecture

Four logical pieces running in one Node.js process (q):

- **Fastify** — REST API, SSE streaming, serves built Vue UI as static files
- **Scheduler** — polls PostgreSQL every `POLL_INTERVAL_MS`, runs one ticket at a time
- **Provisioner** — creates/stops Docker project containers on demand via dockerode
- **SSE Broker** — in-memory fan-out from worker to open browser connections

Each project gets an ephemeral **project container** — a `node:24-slim` image with the `claude` CLI installed, running `sleep infinity`. q invokes the CLI directly via `dockerode.exec()` and parses its streaming JSON stdout. No sidecar HTTP server, no SDK dependency in q itself.

## Tech Stack

- **Runtime**: Node.js 24 LTS, TypeScript (compiled to CommonJS)
- **Claude**: `claude` CLI — invoked inside project containers via `docker exec`
- **Database**: PostgreSQL (external, configured via env vars)
- **HTTP**: Fastify 4 + `@fastify/static`
- **Docker**: `dockerode` — q manages project containers via Docker socket
- **Frontend**: Vue 3 + Vite + Tailwind CSS
- **Notifications**: ntfy (HTTP POST)

## Project Structure

```
src/
  main.ts                # Entrypoint
  config.ts              # Env var loading + validation + scrubEnv()
  db/
    connection.ts        # PostgreSQL pool
    queries.ts           # All DB operations
  models/types.ts        # Shared TypeScript types
  broker/broker.ts       # SSE fan-out
  worker/
    scheduler.ts         # Poll loop + dispatch
    provisioner.ts       # Docker container lifecycle (create/stop/idle timeout)
    claude-client.ts     # docker exec CLI invocation (NDJSON streaming)
    session.ts           # buildInitialMessages(), isQuestion(), runDrySession()
    notify.ts            # ntfy notifications
  api/
    server.ts            # Fastify setup
    tickets.ts           # Ticket CRUD
    projects.ts          # Project CRUD
    messages.ts          # Thread + reply routes
    stream.ts            # SSE route
    status.ts            # Queue status

Dockerfile               # q image (no SDK — q doesn't call Claude)
Dockerfile.project        # project container (node:24-slim + claude CLI + sleep infinity)

ui/src/
  main.ts                # Vue app + router
  App.vue                # Shell + dry-run banner
  api.ts                 # Typed fetch client
  views/
    NewTicket.vue         # Create form (project selector)
    TicketDetail.vue      # SSE chat view + reply box
  components/
    StatusChip.vue
    PriorityPips.vue
    ProjectTree.vue       # Left sidebar: projects + tickets grouped
```

## Environment Variables

Required (fail fast on missing). DB credentials are **deleted from `process.env` immediately after startup** — project containers never receive them.

```bash
DB_HOST=
DB_NAME=
DB_USER=
DB_PASSWORD=
PROJECTS_DIR=                   # base directory for project working directories
```

Optional:

```bash
DB_PORT=5432
ANTHROPIC_API_KEY=              # required if DRY_RUN=false; passed per-exec to containers
NTFY_URL=                       # ntfy push notification endpoint
API_PORT=3200
POLL_INTERVAL_MS=5000
RETRY_DELAY_MS=60000
CONTAINER_IDLE_TIMEOUT_MS=600000   # stop container after 10 min idle
PROJECT_IMAGE=q-project         # Docker image name for project containers
DRY_RUN=false                   # set true to skip Docker + Claude entirely
```

## Commands

```bash
# Backend (q)
npm run build          # compile TypeScript → dist/
npm start              # run compiled output
npm run dev            # tsx watch (hot reload)

# Frontend
cd ui && npm run dev   # Vite dev server (proxies /api → :3200)
cd ui && npm run build # build to ui/dist/ (served by Fastify in prod)
```

## Database

Run `sql/1.sql` once to create tables:

```bash
psql -U postgres -f sql/1.sql
```

Tables: `projects`, `tickets`, `messages`

- `tickets.project_id` references `projects.id`
- Conversation history is derived from `messages` on the fly via `getConversation()`

## Project Containers

Each project gets an ephemeral Docker container built from `Dockerfile.project`: `node:24-slim` with the `claude` CLI installed and `sleep infinity` as the entrypoint.

q invokes the CLI via `dockerode.exec()`:
```
claude -p --output-format stream-json --dangerously-skip-permissions
```

The prompt is piped via stdin. `ANTHROPIC_API_KEY` is passed per-exec (not baked into the container env).

CLI output is streaming newline-delimited JSON. q maps these events to its internal `StreamEvent` type:

- `assistant` events → extract `text` and `tool_use` blocks
- `result` events → map to `done` (success) or `paused` (if `isQuestion()` matches) or `error`

## Session Management

Containers are stateless. Conversation history is derived from the `messages` table — no separate session state.

- **First run**: `buildInitialMessages(ticket)` returns `[{ role: 'user', content: systemPrompt + description }]`, inserts initial prompt into `messages`
- **Each run**: `getConversation(ticketId)` rolls up `messages` rows into `ConversationMsg[]`, flatten to prompt string, pipe to CLI
- All events (text, tool_use, done, paused, etc.) are persisted to `messages` during streaming

## Pause / Resume Flow

1. CLI result text triggers `isQuestion()` heuristic → q emits `paused` event
2. Paused event is persisted to `messages` table
3. User posts reply via `POST /api/tickets/:id/reply`
4. User reply is inserted into `messages`, ticket re-queued
5. Scheduler picks up ticket, derives conversation from `messages`, pipes to CLI

## Dry Run Mode

Set `DRY_RUN=true` to test the full pipeline without Docker or Claude.

- Provisioner is skipped entirely — no containers created
- Scheduler calls `runDrySession()` directly (same event types)
- P1/P2 tickets simulate a pause/resume question
- UI shows an orange "DRY RUN MODE" banner

## Key Decisions

- **One ticket at a time** — quota is shared; parallelism hits the wall faster
- **SSE over WebSocket** — simpler, auto-reconnects on mobile, no upgrade handshake
- **Git branch per ticket** — Claude works in `q/{ticket_id}`, pushes on done
- **PostgreSQL external** — no compose file; `DB_HOST` etc. point at wherever PostgreSQL runs
- **q invokes claude CLI via docker exec** — no SDK dependency in q; CLI runs inside project containers
- **Containers are stateless** — full conversation history flattened and piped each run; no ~/.claude/ persistence needed
- **Project containers ephemeral** — no volumes beyond `/workspace` mount; idle timeout auto-removes them
- **API key passed per-exec** — not baked into container env; more secure
- **Env wiped at startup** — `scrubEnv()` clears all of `process.env`; config object already holds everything needed
