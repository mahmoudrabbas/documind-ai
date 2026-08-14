import type { ToolRegistry } from "@/modules/agents/toolRegistry.js";
import type { StorageProvider, SecurityScanner, ProcessingDispatcher } from "@/providers/storage/types.js";
import {
  createDocumentSearchTool,
  createDocumentGetTool,
  createDocumentUpdateMetadataTool,
  createDocumentArchiveTool,
  createDocumentRestoreTool,
  createDocumentSoftDeleteTool,
  createDocumentPermanentDeleteTool,
} from "./tools/documentTools.js";
import {
  createUserInviteTool,
  createUserResendInvitationTool,
  createUserRevokeInvitationTool,
  createUserDeleteTool,
  createUserListTool,
} from "./tools/userTools.js";
import { createSettingsUpdateTool } from "./tools/settingsTools.js";

export function registerActionTools(
  toolRegistry: ToolRegistry,
  deps: {
    storageProvider: StorageProvider;
    securityScanner: SecurityScanner;
    processingDispatcher: ProcessingDispatcher;
  },
): void {
  // Document tools
  toolRegistry.register(createDocumentSearchTool(deps));
  toolRegistry.register(createDocumentGetTool(deps));
  toolRegistry.register(createDocumentUpdateMetadataTool(deps));
  toolRegistry.register(createDocumentArchiveTool(deps));
  toolRegistry.register(createDocumentRestoreTool(deps));
  toolRegistry.register(createDocumentSoftDeleteTool(deps));
  toolRegistry.register(createDocumentPermanentDeleteTool(deps));

  // User tools
  toolRegistry.register(createUserInviteTool());
  toolRegistry.register(createUserResendInvitationTool());
  toolRegistry.register(createUserRevokeInvitationTool());
  toolRegistry.register(createUserDeleteTool());
  toolRegistry.register(createUserListTool());

  // Settings tools
  toolRegistry.register(createSettingsUpdateTool());
}