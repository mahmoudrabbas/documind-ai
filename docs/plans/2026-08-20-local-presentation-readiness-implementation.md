# Local Presentation Readiness Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix Windows logo serving and make the frontend build and render its fonts/icons without external network access.

**Architecture:** Keep logical storage keys platform-independent while leaving physical filesystem operations native. Vendor the two existing Google-hosted fonts and load them locally without changing component icon markup or tenant behavior.

**Tech Stack:** TypeScript, Node test runner, Express, Next.js 16, CSS `@font-face`.

---

### Task 1: Portable Local Storage Keys

**Files:**
- Modify: `api/src/providers/storage/index.ts`
- Test: `api/src/providers/storage/localStorageProvider.test.ts`

1. Add a failing test asserting that `saveFile` returns `tenantId/file.png`,
   never a Windows backslash key, and that the returned key reads successfully.
2. Run the focused test and confirm it fails on Windows.
3. Build the logical key with `path.posix.join` and the physical path with
   `path.join`.
4. Re-run the focused test and the existing logo integration test.

### Task 2: Offline Font Assets

**Files:**
- Add: `app/src/app/fonts/Cairo-Variable.ttf`
- Add: `app/src/app/fonts/MaterialSymbolsOutlined-Variable.woff2`
- Modify: `app/src/app/fonts.ts`
- Modify: `app/src/app/layout.tsx`
- Modify: `app/src/app/globals.css`
- Test: `app/src/app/__tests__/offline-fonts.test.ts`

1. Add a failing source-level contract asserting there is no
   `next/font/google`, `fonts.googleapis.com`, or `fonts.gstatic.com` dependency
   in the root font/layout files.
2. Run the focused app test and confirm it fails.
3. Vendor the font files, switch Cairo to `next/font/local`, define the local
   Material Symbols face, and remove the remote stylesheet.
4. Re-run the focused test, app typecheck/lint, and production build.

### Task 3: Release Verification and Commit

1. Confirm `MONGODB_URI` is unset before database-backed tests.
2. Run the official API suite through `npm.cmd test --workspace api`.
3. Run API build/typecheck/lint and app tests/typecheck/lint/build.
4. Run `git status --short` and `git diff --check`.
5. Commit as small reviewable local commits and keep
   `fix/v1-final-stabilization` unmerged for owner review.
