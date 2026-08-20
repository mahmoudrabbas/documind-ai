# Local Presentation Readiness Design

## Goal

Make the API test suite and frontend production build succeed on a Windows
presentation machine without depending on external font services or touching
any real tenant database.

## Proven Root Causes

1. `LocalStorageProvider` returns logical storage keys using the host path
   separator. On Windows an uploaded logo key is `tenantId\\file.png`, while
   `uploadTenantLogo` extracts the public filename by splitting on `/`. The
   resulting public URL has no filename, so `/public/logos/:tenantId/:file`
   cannot match and returns 404 even though the file exists.
2. `app/src/app/fonts.ts` uses `next/font/google` for Cairo. `next build` must
   contact Google Fonts and fails when the presentation environment has no
   outbound network access.
3. Material Symbols are loaded by an external stylesheet in the root layout.
   This does not block compilation, but an offline presentation would render
   icon ligature names instead of icons.

## Design

### Portable Storage Keys

Use POSIX separators for the logical key returned by local storage, matching
the existing S3 provider contract. Continue using `path.join` only for the
physical filesystem path. Existing Windows keys remain readable because the
read/delete methods still pass stored keys to the Windows filesystem.

### Local Fonts

Store the Cairo variable font and Material Symbols font under
`app/src/app/fonts/`. Load Cairo with `next/font/local` and define a local
`@font-face` for Material Symbols. Remove both Google font references from the
root layout. This preserves the current typography and icon markup while making
the build and runtime presentation independent of external font availability.

## Data Safety

No migration, seed, tenant cleanup, database drop, or production database
command is required. API integration tests run only through the repository
runner, which creates a random in-memory `documind-test-<uuid>` database. The
test suite's fixture cleanup is guarded so it refuses non-test database names.

## Verification

- Add a local-storage regression that requires forward-slash logical keys.
- Re-run the existing logo upload/public-fetch/replacement test.
- Add a source-level offline-font contract that rejects Google font imports and
  remote font stylesheet links in the root layout.
- Run the official API suite, API build/typecheck/lint, app tests/typecheck/lint,
  and the app production build.

