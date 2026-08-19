# Arabizi Mixed-Language Stability Design

## Goal

Keep Arabizi and mixed Arabic/English questions on a stable knowledge route and
preserve their numeric eligibility anchors without introducing a large phrase
dictionary or changing authorization and retrieval architecture.

## Evidence

The current detector requires two entries from `ARABIZI_TOKENS`, so nearby
questions can flip between English and Arabic answer modes when one question
contains one known token and the next contains two. Numeric extraction also
misses Arabizi duration nouns such as `yom` and recurrence markers such as
`fel week`; Arabic dual forms such as `يومين` contain no digit and therefore
produce no numeric mention.

## Design

1. Keep the existing two-token dictionary rule as the conservative baseline.
   Add a structural Arabizi signal: a bounded Latin token of at least four
   letters containing a single Arabizi substitution digit between letters
   (`2`, `3`, `5`, `6`, `7`, `8`, or `9`). Exclude common technical tokens and
   short digit-heavy identifiers. One structural hit counts as one token hit.
2. Extend the existing numeric unit table with common Arabizi duration and
   period spellings (`yom`, `yoom`, `youm`, `ayam`, `sa3a`, `osbo3`, `shahr`,
   `sana`, and variants). Extend the existing recurrence marker with `fel`,
   `fil`, `kol`, and `kul`.
3. Normalize Arabic dual morphology in `normalizeNumericText` by converting
   dual day/month/hour/year words to an explicit `2 <unit>` form. This keeps
   offsets and all downstream comparison logic in the existing normalized-text
   pipeline.
4. Do not change the knowledge-signal dictionary for the Arabic-only
   `remote`-less phrase. Existing routing rescue/fallback already keeps that
   case on the knowledge path, and expanding phrase dictionaries would violate
   the no-large-dictionary constraint.

## Testing

Add failing tests first for:

- Arabizi stability across the four representative questions and technical
  false-positive exclusions.
- Arabizi duration units and `fel week` period extraction.
- Arabic dual numeric extraction and threshold comparison.
- Existing English, Arabic, mixed, and identifier behavior remaining stable.

Run the language-detector and threshold-semantics focused suites, then the
intent routing/knowledge-signal suites and TypeScript typecheck.

