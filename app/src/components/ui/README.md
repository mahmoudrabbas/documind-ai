# DocuMind AI — Base Design System (T1.3.3)

Implements the tokens in `DESIGN.md` (repo root) as Tailwind utilities and a
first set of shared components, per EPIC 1 / F1.3.

## Where things live

| Concern                         | File                                   |
| -------------------------------- | --------------------------------------- |
| Color / type / radius / spacing / shadow tokens | `app/src/app/globals.css` (`@theme` block) |
| System font stack                | `app/src/app/globals.css`               |
| JS/TS mirror of color tokens (for charts, canvas, inline styles) | `app/src/lib/design-tokens.ts` |
| Shared components                | `app/src/components/ui/*`               |
| Pure variant-resolution logic (unit-testable, no JSX) | `app/src/components/ui/variants.ts` |

## Usage

```tsx
import { Button, Badge, Card, CardHeader, CardTitle, CardContent, StatCard, Avatar, Input } from "@/components/ui";

<Card>
  <CardHeader>
    <CardTitle>Total Documents</CardTitle>
    <Badge status="Ready" />
  </CardHeader>
  <CardContent>1,284</CardContent>
</Card>

<Button variant="secondary">Ask AI</Button>
```

### Typography

Every DESIGN.md typography role is a Tailwind text utility:
`text-display-lg`, `text-headline-lg`, `text-headline-lg-mobile`,
`text-headline-md`, `text-title-lg`, `text-body-lg`, `text-body-md`,
`text-body-sm`, `text-label-md`, `text-label-sm`. Each already carries the
correct line-height, tracking, and weight — no need to add `font-semibold`
etc. alongside it.

### Colors

Tokens are named exactly as in `DESIGN.md`'s `colors` block, so
`bg-primary`, `text-on-surface-variant`, `border-outline-variant`, etc. all
work directly. There is intentionally no dark-mode override yet — DESIGN.md
only specifies a light enterprise theme.

### Badge status mapping

`<Badge status="Ready" />` and `<Badge status="ready" />` both resolve to
the same "success" styling — matching is case-insensitive and trims
whitespace, and unrecognized labels (or non-string input) render as a
neutral pill rather than throwing. See `resolveBadgeStatus` in
`variants.ts` for the full word list, and its tests in
`__tests__/variants.test.ts` for the fallback behavior.

## Testing

```bash
npm run test --workspace app
```

`variants.ts` and `Avatar.tsx`'s `getInitials` are plain functions (no
JSX/DOM), so they're covered directly with Vitest under
`app/src/components/ui/__tests__/`, including invalid-input cases
(`undefined`, `null`, empty string, unknown labels, non-string values).
Component rendering tests (requiring `@testing-library/react` + a jsdom
environment) are intentionally out of scope for this task — see
"Not in scope" below.

## Not in scope for this task

- Full jsdom/`@testing-library/react` rendering tests for components —
  would need a `vitest.config.ts` environment change
  (`environment: "node"` → `"jsdom"`) plus new dev dependencies. Flagged
  for a follow-up task rather than folded silently into T1.3.3.
- Sidebar / navigation shell, forms with multi-field validation, data
  tables, and chart wrappers — these compose the primitives here but are
  scoped to their owning feature tickets (e.g. F1.3's later tasks, F7.1
  analytics), not this base design-system ticket.
- Dark theme — no dark palette exists in `DESIGN.md` yet.
