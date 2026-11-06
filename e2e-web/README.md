# @padel/e2e-web

End-to-end tests for the PadelJam **web** app, powered by
[Playwright](https://playwright.dev). The mobile app has its own separate
end-to-end harness (idb + vitest, driving the iOS simulator) at
[`apps/mobile/e2e`](../apps/mobile/e2e/README.md).

## Setup

Browsers are installed via the workspace. If you're setting up fresh:

```bash
pnpm install
pnpm --filter @padel/e2e-web exec playwright install
```

## Running tests

From anywhere in the repo:

```bash
pnpm --filter @padel/e2e-web test:e2e          # run all tests, all browsers
pnpm --filter @padel/e2e-web test:e2e:ui       # interactive UI mode
pnpm --filter @padel/e2e-web test:e2e:headed   # headed browsers
pnpm --filter @padel/e2e-web test:e2e:debug    # step-through debugger
pnpm --filter @padel/e2e-web test:e2e:report   # open the last HTML report
```

Target a specific browser or file:

```bash
pnpm --filter @padel/e2e-web test:e2e --project=chromium tests/example.spec.ts
```

## The web server

The config boots the `web` app automatically on a **dedicated port `:3100`**
(override with `WEB_PORT`) so the suite never collides with a dev server on the
default `:3000`. `next dev` reads `apps/web/.env.local`. Point tests at a
deployed environment instead with:

```bash
BASE_URL=https://padeljam.app pnpm --filter @padel/e2e-web test:e2e
```

## Tests

- `tests/example.spec.ts` — scaffold smoke test (hits playwright.dev; no backend).
- `tests/auth-identifier.spec.ts` — the `/auth` entry:
  - _validation (client-side)_ — a malformed address, or a phone number (phone sign-in is hidden
    for launch, PAD-137), is marked "missing information" and nothing is sent.
  - _OTP transition (mocked send)_ — a valid email advances to the OTP step with the send stubbed.
  - _sign-up (real send)_ — a new email's code is read from Mailpit, then name, password and terms
    create the account (no phone or second identifier asked) and the session survives a reload.
    Set `E2E_MAILPIT_URL` to your stack's Mailpit (default `http://127.0.0.1:55324`).

### Local Supabase requirement

`auth-identifier.spec.ts` talks to the local Supabase stack at
`http://localhost:55321` (per `apps/web/.env.local`). Start it first:

```bash
/Users/Shared/paperclip-ops/stack-slot start padeljam -- pnpm dlx supabase@2.117.0 --workdir infra start
```

Exit 75 means no stack slot came free and nothing started: try later. After stopping the stack, run
`stack-slot release padeljam`.

A `beforeAll` health precheck fails fast with an actionable message if the
stack isn't reachable.

## CI

None yet — the repo has no `.github/workflows`, so this suite runs only when
someone runs it locally. A workflow would need to spin up the local Supabase
stack, wire its URL/anon key into `apps/web/.env.local`, install the browsers,
and upload the HTML report as an artifact.

> Note: this workspace's test script is `test:e2e`, not `test`, so `pnpm test` /
> `turbo run test` at the repo root does **not** launch browsers.
