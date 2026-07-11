import { Suspense } from "react";
import { TenantsClient } from "../tenants/tenants-client";

export default function CompaniesPage() {
  return (
    <Suspense
      fallback={
        <div className="p-6 text-sm text-on-surface-variant">
          Loading companies…
        </div>
      }
    >
      <TenantsClient />
    </Suspense>
  );
}
