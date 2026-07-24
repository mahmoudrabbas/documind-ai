import { DashboardPage, DashboardPageHeader } from "@/components/ui/DashboardPage";
import { TaxonomyManager } from "@/components/documents/TaxonomyManager";

export default function DocumentTaxonomyPage() {
  return <DashboardPage><DashboardPageHeader title="Document taxonomy" description="Manage tenant categories, departments, and sensitivity classifications." /><TaxonomyManager /></DashboardPage>;
}
