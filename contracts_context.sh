#!/usr/bin/env bash
{
  echo "## Relevant files for workers/contracts architecture issue"
  echo

  for f in \
    package.json \
    tsconfig.base.json \
    api/package.json \
    api/tsconfig.json \
    api/src/modules/jobs/jobDispatcher.ts \
    workers/package.json \
    workers/tsconfig.json \
    workers/src/contracts/index.ts \
    workers/src/contracts/jobEnvelope.ts \
    workers/src/contracts/idempotency.ts \
    workers/src/contracts/jobDispatcher.ts \
    workers/src/contracts/handlerRegistry.ts \
    workers/src/contracts/bullmqQueue.ts \
    workers/src/contracts/inMemoryQueue.ts \
    workers/src/contracts/retryPolicy.ts \
    workers/src/contracts/metrics.ts
  do
    if [[ -f "$f" ]]; then
      ext="${f##*.}"
      echo "### \`$f\`"
      echo '```'"$ext"
      cat "$f"
      echo '```'
      echo
    else
      echo "> ⚠️ missing: $f"
      echo
    fi
  done
} > contracts_context.md

wc -l contracts_context.md
