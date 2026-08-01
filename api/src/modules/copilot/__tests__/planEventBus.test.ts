import { describe, it, expect, vi, beforeEach } from "vitest";
import { PlanEventBus } from "../events/planEventBus.js";
import type { CopilotPlanEvent } from "../copilot.types.js";

const replayMax = 3;

vi.mock("../../../config/index.js", () => ({
  config: {
    COPILOT_EVENT_REPLAY_MAX: 3,
  },
}));

function makeEvent(type: string, planId: string, at = "t"): CopilotPlanEvent {
  return { type: type as never, planId, at };
}

describe("PlanEventBus", () => {
  let bus: PlanEventBus;

  beforeEach(() => {
    bus = new PlanEventBus();
  });

  it("delivers events to subscribers", () => {
    const listener = vi.fn();
    bus.subscribe("plan-1", listener);
    const event = makeEvent("step.started", "plan-1");
    bus.publish("plan-1", "tenant-1", event);
    expect(listener).toHaveBeenCalledWith(event);
  });

  it("stops delivering after unsubscribe", () => {
    const listener = vi.fn();
    const unsubscribe = bus.subscribe("plan-1", listener);
    unsubscribe();
    bus.publish("plan-1", "tenant-1", makeEvent("step.completed", "plan-1"));
    expect(listener).not.toHaveBeenCalled();
  });

  it("replays stored events filtered by tenant", () => {
    bus.publish("plan-1", "tenant-1", makeEvent("plan.ready", "plan-1"));
    bus.publish("plan-1", "tenant-2", makeEvent("step.started", "plan-1"));

    const tenant1 = bus.replay("plan-1", "tenant-1");
    const tenant2 = bus.replay("plan-1", "tenant-2");

    expect(tenant1.map((e) => e.type)).toEqual(["plan.ready"]);
    expect(tenant2.map((e) => e.type)).toEqual(["step.started"]);
  });

  it("caps the replay buffer to the configured maximum", () => {
    for (let i = 0; i < replayMax + 2; i++) {
      bus.publish("plan-1", "tenant-1", makeEvent(`plan.ready`, "plan-1"));
    }
    const replayed = bus.replay("plan-1", "tenant-1");
    expect(replayed.length).toBe(replayMax);
  });

  it("drops listeners and buffer for a plan", () => {
    const listener = vi.fn();
    bus.subscribe("plan-1", listener);
    bus.publish("plan-1", "tenant-1", makeEvent("plan.ready", "plan-1"));
    bus.dropPlan("plan-1");
    bus.publish("plan-1", "tenant-1", makeEvent("plan.completed", "plan-1"));

    expect(listener).toHaveBeenCalledTimes(1);
    bus.dropPlan("plan-1");
    expect(bus.replay("plan-1", "tenant-1")).toEqual([]);
  });

  it("continues when a subscriber throws", () => {
    const throwing = vi.fn(() => { throw new Error("boom"); });
    const healthy = vi.fn();
    bus.subscribe("plan-1", throwing);
    bus.subscribe("plan-1", healthy);
    bus.publish("plan-1", "tenant-1", makeEvent("plan.ready", "plan-1"));
    expect(healthy).toHaveBeenCalledTimes(1);
  });
});
