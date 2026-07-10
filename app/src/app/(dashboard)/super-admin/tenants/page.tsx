import { Suspense } from "react";
import { RoleGuard } from "@/components/auth/auth-guard";
import { TenantsClient } from "./tenants-client";

export default function TenantsPage() {
  return <RoleGuard role="SUPER_ADMIN"><Suspense fallback={<main className="p-8" aria-busy="true">Loading tenants…</main>}><TenantsClient /></Suspense></RoleGuard>;
}
