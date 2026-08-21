# Deterministic Citation Support Design

## Problem

The citation pipeline can retrieve, approve, and reauthorize the correct document chunk, then discard a correct grounded answer because the semantic LLM returns a false negative. The observed failure rejected these commands even though they appeared verbatim in the cited chunk:

```text
sudo apt-get install mariadb-server
sudo yum install mariadb-server
sudo systemctl enable mariadb
sudo systemctl start mariadb
```

The `fix/v1-final-stabilization` branch is already merged into `release/v1`, and its retrieval and citation-verification code is identical. This is therefore not a branch regression, upload failure, indexing failure, or authorization failure.

## Chosen Approach

Add a deterministic direct-support check inside `CitationSemanticVerificationService` before sending a claim to the semantic model, plus conservative parsing for one complete Markdown-fenced JSON response from the semantic provider.

A claim is directly supported only when it is composed of shell/code commands and one supplied evidence chunk covers those commands through ordered verbatim matches on isolated prompt-marked lines. Punctuation, shell prompt characters, casing, and whitespace are presentation differences. The connectors `and` and `then` may bridge otherwise exact command spans from separate evidence lines.

Each matched span must contain at least three tokens, except when the entire short command is an exact contiguous match. All command-starting claim tokens must be covered, matches must remain in claim and evidence order, and all spans must come from one chunk. Prose, negated statements, historical text, examples, and quoted mentions are not direct-support candidates; they remain subject to semantic verification. This prevents unrelated or context-sensitive text from being assembled across documents, lines, or chunks.

Natural-language answers may use a bounded presentation template around quoted or backticked command literals: `For <distribution>, use <command>` and the exact multi-command form `..., then enable and start the service with <command> and <command>`. Other prose remains on the semantic-verification path.

## Verification Flow

1. Prepare bounded factual claims as today.
2. Run the existing deterministic numeric-contradiction check.
3. If a contradiction exists, mark the claim unsupported.
4. Otherwise, try deterministic direct support against isolated prompt-marked command lines in each authorized evidence chunk.
5. If one chunk directly supports the complete claim, mark it supported with that chunk ID and skip the semantic model for that claim.
6. Send only remaining claims to the existing semantic model and preserve its retry and fail-closed behavior.
7. Apply the same flow during the final release pass.

Provider JSON is accepted as either a complete JSON object or one complete ` ```json ... ``` ` / ` ``` ... ``` ` envelope. Partial fences, surrounding commentary, and malformed JSON remain `UNKNOWN`.

The citation agent's tenant scoping, document eligibility, `use_in_ai` authorization, approved-evidence membership, and TOCTOU reauthorization remain unchanged.

## Failure Behavior

An added command, qualifier, condition, number, or factual phrase that is absent from the evidence cannot pass deterministic support. It continues to the semantic verifier and is rejected when unsupported. Provider failures and token-budget exhaustion retain their current behavior for claims that require semantic verification.

## Tests

Add focused regressions proving:

- The exact MySQL/MariaDB answer from the failed production run verifies against the cited chunk even when the scripted semantic model would reject it.
- The deterministic match uses the cited evidence ID and requires no provider call when every claim is directly supported.
- Adding an unsupported command such as `sudo systemctl restart mariadb` does not pass the deterministic check.
- Negated, historical, quoted, or example-only command mentions continue to semantic verification and fail closed when unsupported.
- Commands split across separate evidence chunks are not combined into one deterministic proof.
- A complete Markdown-fenced provider judgment is parsed the same as plain JSON; malformed or partially fenced output still fails closed.
- Existing numeric-contradiction and semantic-verifier tests remain green.
