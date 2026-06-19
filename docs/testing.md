# Testing — local + CI

## What's covered today

| Layer | Tool | Status |
|---|---|---|
| Backend unit | Jest + ts-jest | ✅ 50+ tests passing |
| Backend integration | Jest + supertest | ✅ Wired to a Docker Postgres test DB (this doc) |
| Frontend component | Vitest + React Testing Library | ⏳ Day 2 |
| Frontend E2E | Playwright | ⏳ Day 2 |
| CI runner | GitHub Actions | ⏳ Day 3 |

## Running tests locally

Unit tests don't need a database — they're fully mocked:

```bash
cd server
npm run test:unit
```

Integration tests need a Postgres test database. Pick one of three setups below, then:

```bash
cd server
npm run test:db:up        # boots the local Postgres container
npm test                  # runs unit + integration
npm run test:db:down      # stops + wipes the test DB when done
```

Or all-in-one (boots, runs, tears down):

```bash
npm run test:ci
```

### Setup option A — Docker Desktop (recommended)

Install [Docker Desktop](https://www.docker.com/products/docker-desktop/) (free). On macOS:

```bash
# via Homebrew
brew install --cask docker
open /Applications/Docker.app   # then sign in (free account)
```

Or use **[OrbStack](https://orbstack.dev/)** — a lighter, faster Docker Desktop alternative (free for personal use). Either one provides the `docker` CLI that `npm run test:db:up` calls.

Verify:

```bash
docker --version
```

### Setup option B — Local Postgres via Homebrew (no Docker)

If you prefer to skip Docker entirely:

```bash
brew install postgresql@16
brew services start postgresql@16
createdb truckflow_test
# Then update server/.env.test:
#   DATABASE_URL=postgres://$(whoami)@localhost:5432/truckflow_test
```

Then run tests as normal — Jest's globalSetup applies the schema and seeds users on first run.

### Setup option C — A separate free Supabase project as the test DB

If you don't want anything running locally, create a **second Supabase project** (the free tier allows up to 2 projects per organization). Use that project's connection string in `server/.env.test`:

```
DATABASE_URL=postgres://postgres:<password>@db.<ref>.supabase.co:5432/postgres
```

Cons: slightly slower than local (network roundtrip per query), and the DB persists between runs (not auto-cleaned by `test:db:down`).

## How the test DB is set up

The first time you run `npm test` against a fresh test DB:

1. `globalSetup.ts` waits for Postgres to accept connections
2. Applies the full v1.5 schema via the `runSchema` helper (same code path as production deploys)
3. Seeds three test users with `Password123!` and known roles:
   - `admin@truckflow.com` (admin)
   - `rep@truckflow.com` (sales_agent)
   - `dispatcher@truckflow.com` (dispatcher)

On subsequent runs, the schema is detected as already applied and only the data is wiped (`TRUNCATE ... CASCADE`) and re-seeded. This keeps each test run isolated without paying the schema-apply cost every time.

## Writing new integration tests

Import the seeded users from `globalSetup` and authenticate via `/api/auth/login`:

```ts
import request from 'supertest';
import app from '../../app';
import { TEST_USERS } from '../globalSetup';

let adminToken: string;

beforeAll(async () => {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: TEST_USERS.admin.email, password: TEST_USERS.admin.password });
  adminToken = res.body.access_token;
});

it('lists truckers', async () => {
  const res = await request(app)
    .get('/api/truckers')
    .set('Authorization', `Bearer ${adminToken}`);
  expect(res.status).toBe(200);
});
```

## CI (Day 3 — not built yet)

GitHub Actions will spin up a Postgres service container on every push and run the full test suite without needing Docker installed on the runner. See the Day 3 section of the conversation for the wiring plan.
