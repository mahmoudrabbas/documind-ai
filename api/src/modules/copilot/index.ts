import { CopilotToolRegistry } from "./tools/toolRegistry.js";
import { CopilotPlanner } from "./planner/planner.service.js";
import { ActionExecutor } from "./executors/actionExecutor.js";
import { CopilotService } from "./copilot.service.js";
import { createCopilotRoutes } from "./copilot.routes.js";
import { authorizeTenantOperation } from "../permissions/permissions.operation.js";
import { registerDefaultTools } from "./tools/registerTools.js";
import { planEventBus } from "./events/planEventBus.js";

let serviceInstance: CopilotService | null = null;

async function createCopilotService(): Promise<CopilotService> {
  const registry = new CopilotToolRegistry();
  registerDefaultTools(registry);

  const { getModelAdapterAsync } = await import("../../providers/llm/index.js");
  const planner = new CopilotPlanner(await getModelAdapterAsync(), registry);
  const executor = new ActionExecutor(
    registry,
    (ctx: Record<string, unknown>, perm: string) =>
      authorizeTenantOperation(ctx as never, perm as never) as unknown as Promise<unknown>,
    (event, tenantId) => {
      if ("planId" in event) {
        planEventBus.publish(event.planId, tenantId, event);
      }
    },
  );
  return new CopilotService(planner, executor, registry);
}

const initPromise = createCopilotService().then((s) => { serviceInstance = s; });

export async function copilotRoutes() {
  await initPromise;
  return createCopilotRoutes(serviceInstance!);
}
