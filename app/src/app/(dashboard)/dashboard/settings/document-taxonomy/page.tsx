import { DashboardPage, DashboardPageHeader } from "@/components/ui/DashboardPage";
import { TaxonomyManager } from "@/components/documents/TaxonomyManager";

export default function DocumentTaxonomyPage() {
  return <DashboardPage><DashboardPageHeader guideId="page-heading-document-taxonomy" title="Document taxonomy" description="Manage tenant categories, departments, and sensitivity classifications." /><TaxonomyManager /></DashboardPage>;
}
