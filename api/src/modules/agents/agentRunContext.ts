import type { BaseRole } from "../../common/auth/baseRoles.js";
import type { RunContext } from "./agents.types.js";

export type AgentRunContext = RunContext & {
  actorEmail: string;
  actorRole: BaseRole;
};
