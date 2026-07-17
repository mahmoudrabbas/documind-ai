import type { EntitlementChecker } from "../storage/types.js";

export class FakeEntitlementChecker implements EntitlementChecker {
  async checkUploadAllowed(_tenantId: string, _fileSize: number): Promise<void> {
    // no-op: always allows uploads
  }
}
