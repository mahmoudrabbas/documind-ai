import { config } from "../../../config/index.js";
import type { CopilotPlanEvent } from "../copilot.types.js";

type Listener = (event: CopilotPlanEvent) => void;

export interface StoredPlanEvent {
  event: CopilotPlanEvent;
  tenantId: string;
  seq: number;
}

export class PlanEventBus {
  private listeners = new Map<string, Set<Listener>>();
  private buffers = new Map<string, StoredPlanEvent[]>();
  private seq = 0;

  subscribe(planId: string, listener: Listener): () => void {
    let set = this.listeners.get(planId);
    if (!set) {
      set = new Set();
      this.listeners.set(planId, set);
    }
    set.add(listener);
    return () => {
      set.delete(listener);
      if (set.size === 0) {
        this.listeners.delete(planId);
      }
    };
  }

  publish(planId: string, tenantId: string, event: CopilotPlanEvent): void {
    const stored: StoredPlanEvent = { event, tenantId, seq: ++this.seq };
    let buffer = this.buffers.get(planId);
    if (!buffer) {
      buffer = [];
      this.buffers.set(planId, buffer);
    }
    buffer.push(stored);
    const max = config.COPILOT_EVENT_REPLAY_MAX;
    if (buffer.length > max) {
      buffer.splice(0, buffer.length - max);
    }

    const set = this.listeners.get(planId);
    if (set) {
      for (const listener of set) {
        try {
          listener(event);
        } catch {
          // a failing subscriber must not break the bus
        }
      }
    }
  }

  replay(planId: string, tenantId: string): CopilotPlanEvent[] {
    const buffer = this.buffers.get(planId) ?? [];
    return buffer.filter((s) => s.tenantId === tenantId).map((s) => s.event);
  }

  dropPlan(planId: string): void {
    this.listeners.delete(planId);
    this.buffers.delete(planId);
  }
}

export const planEventBus = new PlanEventBus();
