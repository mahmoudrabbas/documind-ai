# CI and secret-management contract

This issue changes repository tooling only; it adds no UI, API route, database model, migration, tenant contract, or fake provider. Existing product authorization and tenant behavior are unchanged.

## Approved toolchain

Use Node.js 22 and npm 10.9.8, the versions provided by the approved Node 22 base image. The Node major is recorded in `.nvmrc`; `package.json` rejects Node 23+ and npm 11+, and `packageManager` records the exact npm release. CI and every Dockerfile verify the same Node major and npm release. Run `nvm use` (or select Node 22 with an equivalent version manager), then confirm `node --version` and `npm --version` before installing dependencies.

## Local validation

Install exactly the root lockfile once with `MONGOMS_DISABLE_POSTINSTALL=1 npm ci`, create ignored runtime files from `secrets/*.example`, and then run these root checks from the repository root:

```sh
npm run security:secrets
npm run lint
npm run typecheck
npm test
npm run build
docker compose config --quiet
docker build -f api/Dockerfile -t documind-api:issue01 .
docker build -f app/Dockerfile -t documind-app:issue01 .
docker build -f workers/Dockerfile -t documind-workers:issue01 .
```

The four root validation commands explicitly invoke API, app, and worker scripts. They do not use `--if-present`; a missing script or failed workspace stops the command. Output names each workspace. `npm run ci:validate` runs the non-Docker checks in sequence.

Development permits local URL defaults. Production and test API/worker modes require explicit dependency and authentication configuration. Production web builds require `NEXT_PUBLIC_API_URL` and reject loopback hosts. Validation errors contain variable names only, never values.

The `app` workspace's `build` command is the repository validation build. It explicitly supplies `https://api.example.invalid` only when the caller has not supplied a URL. Release and deployment automation must use `NEXT_PUBLIC_API_URL=https://api.example.invalid npm run build:production --workspace app` or another explicit non-loopback API URL; that command has no placeholder and fails unless `NEXT_PUBLIC_API_URL` is explicitly configured. Both paths reject loopback URLs in production.

The repository intentionally uses the root `package-lock.json` as the single workspace lockfile. Do not add workspace-local lockfiles. Some generated `api/dist` files are pre-existing tracked build artifacts even though the root ignore rules still ignore new generated `dist` output by default; API source changes that alter already tracked emitted files must keep those tracked files synchronized. Other generated output, including `workers/dist`, remains ignored. Changing the broader tracked `api/dist` policy belongs in a separate repository-cleanup issue, not Issue 01.

Issue 01 owns repository tooling, CI, manifests, environment examples, Docker/Compose, secret-loading infrastructure, and documentation only. It does not add user-facing UI, API routes, database schemas, tenant behavior, or product adapters.

API integration tests pin MongoDB 6.0.20 and download it on demand when it is not already cached. The install-time MongoDB 8 download is disabled because it is both unnecessary and different from the tested version.

## CI behavior

The GitHub workflow performs the committed-secret check, mandatory lint/typecheck/test/build checks for all workspaces, Dockerfile builds for all three services, and Compose configuration validation. Each job writes a value-free status and duration summary and uploads only those summaries. Any failed workspace or image makes the required CI result fail.

Future deployment jobs must use least-privileged credentials, protected GitHub environments, approval gates, and provider-native secret injection. This repository intentionally contains no deployment credentials and chooses no hosting provider.

## Secret rotation

Follow `secrets/README.md`. Rotation is an operational action outside this code change. Never include the old or new value in a pull request, command transcript, artifact, snapshot, or issue.
