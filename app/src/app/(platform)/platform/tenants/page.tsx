import { Suspense } from "react";
import { TenantsClient } from "../../../(dashboard)/super-admin/tenants/tenants-client";

export default function PlatformTenantsPage() {
  return (
    <Suspense
      fallback={
        <main className="p-8" aria-busy="true">
          Loading tenants...
        </main>
      }
    >
      <TenantsClient />
    </Suspense>
  );
}
