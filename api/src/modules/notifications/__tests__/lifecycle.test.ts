import { describe, expect, it } from "vitest";
import {
  applyUpdateRule,
  DELIVERY_STATES,
  IllegalLifecycleTransitionError,
  LIFECYCLE_EVENTS,
  NOTIFICATION_LIFECYCLE_STATES,
  NOTIFICATION_TYPES,
  transitionLifecycle,
  UPDATE_RULES,
  type LifecycleEvent,
  type LifecycleState,
  type NotificationDraft,
} from "../lifecycle/lifecycle.js";

/**
 * The single source of truth for legal transitions. Every pair in this table
 * must succeed; every (state, event) pair NOT in this table must throw.
 */
const LEGAL_TRANSITIONS: ReadonlyArray<
  readonly [LifecycleState, LifecycleEvent, LifecycleState]
> = [
  ["CREATED", "enqueue", "QUEUED"],
  ["QUEUED", "dispatch", "DISPATCHED"],
  ["DISPATCHED", "deliver", "VISIBLE"],
  ["VISIBLE", "markSeen", "SEEN"],
  ["VISIBLE", "markRead", "READ"],
  ["SEEN", "markRead", "READ"],
  ["READ", "archive", "ARCHIVED"],
  ["READ", "expire", "EXPIRED"],
  // Any state → DELETED.
  ...NOTIFICATION_LIFECYCLE_STATES.map((state) => [state, "delete", "DELETED"] as const),
];

function expectIllegal(current: LifecycleState, event: LifecycleEvent): void {
  let caught: unknown = null;
  try {
    transitionLifecycle(current, event);
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(IllegalLifecycleTransitionError);
  if (caught instanceof IllegalLifecycleTransitionError) {
    expect(caught.current).toBe(current);
    expect(caught.event).toBe(event);
    expect(caught.message).toContain(current);
    expect(caught.message).toContain(event);
  }
}

describe("NOTIFICATION_LIFECYCLE_STATES", () => {
  it("declares the full lifecycle in the canonical chain order", () => {
    expect(NOTIFICATION_LIFECYCLE_STATES).toEqual([
      "CREATED",
      "QUEUED",
      "DISPATCHED",
      "VISIBLE",
      "SEEN",
      "READ",
      "ARCHIVED",
      "EXPIRED",
      "DELETED",
    ]);
  });
});

describe("DELIVERY_STATES", () => {
  it("declares pending | delivered | failed", () => {
    expect(DELIVERY_STATES).toEqual(["pending", "delivered", "failed"]);
  });
});

describe("transitionLifecycle", () => {
  it.each(LEGAL_TRANSITIONS)(
    "allows %s --%s--> %s",
    (current, event, expected) => {
      expect(transitionLifecycle(current, event)).toBe(expected);
    },
  );

  it("walks the full happy-path journey to ARCHIVED", () => {
    let state: LifecycleState = "CREATED";
    state = transitionLifecycle(state, "enqueue");
    state = transitionLifecycle(state, "dispatch");
    state = transitionLifecycle(state, "deliver");
    state = transitionLifecycle(state, "markSeen");
    state = transitionLifecycle(state, "markRead");
    state = transitionLifecycle(state, "archive");
    expect(state).toBe("ARCHIVED");
  });

  it("walks the happy path to EXPIRED", () => {
    let state: LifecycleState = "CREATED";
    state = transitionLifecycle(state, "enqueue");
    state = transitionLifecycle(state, "dispatch");
    state = transitionLifecycle(state, "deliver");
    state = transitionLifecycle(state, "markRead");
    state = transitionLifecycle(state, "expire");
    expect(state).toBe("EXPIRED");
  });

  it("VISIBLE→READ without SEEN is legal", () => {
    expect(transitionLifecycle("VISIBLE", "markRead")).toBe("READ");
  });

  it("READ requires prior VISIBLE or SEEN", () => {
    for (const current of ["CREATED", "QUEUED", "DISPATCHED"] as const) {
      expectIllegal(current, "markRead");
    }
  });

  it("VISIBLE requires prior DISPATCHED", () => {
    for (const current of ["CREATED", "QUEUED"] as const) {
      expectIllegal(current, "deliver");
    }
  });

  it("ARCHIVED|EXPIRED are only reachable from READ", () => {
    for (const current of ["CREATED", "QUEUED", "DISPATCHED", "VISIBLE", "SEEN"] as const) {
      expectIllegal(current, "archive");
      expectIllegal(current, "expire");
    }
  });

  it("throws the typed error for the spec's named illegal cases", () => {
    expectIllegal("CREATED", "markRead");
    expectIllegal("QUEUED", "deliver");
    expectIllegal("CREATED", "archive");
    expectIllegal("SEEN", "archive");
    expectIllegal("QUEUED", "markSeen");
    expectIllegal("DISPATCHED", "markSeen");
    expectIllegal("CREATED", "expire");
  });

  it("every (state, event) pair outside the legal table throws (exhaustive matrix)", () => {
    const legalKeys = new Set(
      LEGAL_TRANSITIONS.map(([state, event]) => `${state}:${event}`),
    );
    for (const state of NOTIFICATION_LIFECYCLE_STATES) {
      for (const event of LIFECYCLE_EVENTS) {
        const key = `${state}:${event}`;
        if (legalKeys.has(key)) {
          continue;
        }
        expectIllegal(state, event);
      }
    }
  });

  it("DELETE is legal from every state, including DELETED itself", () => {
    for (const state of NOTIFICATION_LIFECYCLE_STATES) {
      expect(transitionLifecycle(state, "delete")).toBe("DELETED");
    }
  });

  it("terminal states (ARCHIVED/EXPIRED/DELETED) have no outgoing non-delete transitions", () => {
    for (const terminal of ["ARCHIVED", "EXPIRED", "DELETED"] as const) {
      for (const event of LIFECYCLE_EVENTS) {
        if (event === "delete") {
          continue;
        }
        expectIllegal(terminal, event);
      }
    }
  });

  it("IllegalLifecycleTransitionError is a typed error carrying current/event", () => {
    let caught: unknown = null;
    try {
      transitionLifecycle("CREATED", "markRead");
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(caught).toBeInstanceOf(IllegalLifecycleTransitionError);
    if (caught instanceof IllegalLifecycleTransitionError) {
      expect(caught.name).toBe("IllegalLifecycleTransitionError");
      expect(caught.current).toBe("CREATED");
      expect(caught.event).toBe("markRead");
      expect(caught.message).toContain("CREATED");
      expect(caught.message).toContain("markRead");
    }
  });
});

describe("UPDATE_RULES", () => {
  it("maps every notification type to its rule", () => {
    expect(UPDATE_RULES).toEqual({
      processing_failed: "replace",
      processing_complete: "replace",
      quota_exceeded: "merge",
      knowledge_gap_created: "merge",
      invitation_accepted: "replace",
      welcome: "replace",
      role_changed: "replace",
      document_uploaded: "replace",
    });
  });

  it("covers exactly the exported notification type union", () => {
    for (const type of NOTIFICATION_TYPES) {
      expect(UPDATE_RULES[type]).toBeDefined();
    }
    expect(Object.keys(UPDATE_RULES).sort()).toEqual([...NOTIFICATION_TYPES].sort());
  });

  it("round-9 trigger types are all replace (latest state wins)", () => {
    for (const type of [
      "invitation_accepted",
      "welcome",
      "role_changed",
      "document_uploaded",
    ] as const) {
      expect(UPDATE_RULES[type]).toBe("replace");
    }
  });
});

describe("applyUpdateRule", () => {
  describe("replace", () => {
    it("overwrites content with incoming and increments version 1 → 2", () => {
      const existing: NotificationDraft = {
        version: 1,
        title: { en: "old title" },
        metadata: { documentId: "doc-1" },
      };
      const incoming: NotificationDraft = {
        version: 1,
        title: { en: "new title" },
        metadata: { errorCode: "OCR_FAILED" },
      };
      const result = applyUpdateRule("replace", existing, incoming);
      expect(result.action).toBe("update");
      expect(result.next).toEqual({
        version: 2,
        title: { en: "new title" },
        metadata: { errorCode: "OCR_FAILED" },
      });
    });

    it("drops existing metadata entirely when incoming has none", () => {
      const existing: NotificationDraft = {
        version: 4,
        metadata: { documentId: "doc-1" },
      };
      const result = applyUpdateRule("replace", existing, { version: 1 });
      expect(result.next).toEqual({ version: 5 });
    });
  });

  describe("merge", () => {
    it("preserves existing metadata keys, adds incoming keys, other fields replace, version++", () => {
      const existing: NotificationDraft = {
        version: 1,
        body: { en: "old body" },
        metadata: { documentId: "doc-1", attempts: 1 },
      };
      const incoming: NotificationDraft = {
        version: 1,
        body: { en: "new body" },
        metadata: { attempts: 2, errorCode: "OCR_FAILED" },
      };
      const result = applyUpdateRule("merge", existing, incoming);
      expect(result.action).toBe("update");
      expect(result.next).toEqual({
        version: 2,
        body: { en: "new body" },
        metadata: {
          documentId: "doc-1",
          attempts: 2,
          errorCode: "OCR_FAILED",
        },
      });
    });

    it("merges nested metadata objects (deep-ish) instead of replacing them", () => {
      const existing: NotificationDraft = {
        version: 1,
        metadata: { nested: { x: 1, keep: true } },
      };
      const incoming: NotificationDraft = {
        version: 1,
        metadata: { nested: { y: 2 } },
      };
      const result = applyUpdateRule("merge", existing, incoming);
      expect(result.next?.metadata).toEqual({
        nested: { x: 1, keep: true, y: 2 },
      });
      expect(result.next?.version).toBe(2);
    });

    it("preserves existing metadata when incoming has none", () => {
      const existing: NotificationDraft = {
        version: 1,
        metadata: { documentId: "doc-1" },
      };
      const result = applyUpdateRule("merge", existing, { version: 1, body: "new" });
      expect(result.next).toEqual({
        version: 2,
        body: "new",
        metadata: { documentId: "doc-1" },
      });
    });
  });

  describe("ignore", () => {
    it("returns {action:'ignore', next:null} and never changes the version", () => {
      const existing: NotificationDraft = {
        version: 1,
        metadata: { documentId: "doc-1" },
      };
      const result = applyUpdateRule("ignore", existing, {
        version: 1,
        metadata: { attempts: 9 },
      });
      expect(result).toEqual({ action: "ignore", next: null });
      // No mutation of the existing draft either.
      expect(existing.version).toBe(1);
      expect(existing.metadata).toEqual({ documentId: "doc-1" });
    });
  });

  it("increments the version exactly once per update action", () => {
    const draft: NotificationDraft = { version: 1, metadata: { attempts: 0 } };
    const replace = applyUpdateRule("replace", draft, {
      version: 1,
      metadata: { attempts: 1 },
    });
    expect(replace.next?.version).toBe(2);
    expect(replace.next?.metadata).toEqual({ attempts: 1 });

    const merge = applyUpdateRule("merge", replace.next ?? draft, {
      version: 1,
      metadata: { attempts: 2 },
    });
    expect(merge.next?.version).toBe(3);
    expect(merge.next?.metadata).toEqual({ attempts: 2 });

    const third = applyUpdateRule("replace", merge.next ?? draft, {
      version: 1,
      metadata: { attempts: 3 },
    });
    expect(third.next?.version).toBe(4);
    expect(third.next?.metadata).toEqual({ attempts: 3 });
  });
});
