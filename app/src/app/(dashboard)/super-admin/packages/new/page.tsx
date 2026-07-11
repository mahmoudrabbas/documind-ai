import {
  DashboardPage,
  DashboardPageHeader,
} from "@/components/ui/DashboardPage";
import { PackageForm } from "@/components/super-admin/package-form";
export default function NewPackagePage() {
  return (
    <DashboardPage>
      <DashboardPageHeader
        title="New Package"
        description="Define pricing and usage limits for a new package."
      />
      <PackageForm />
    </DashboardPage>
  );
}
