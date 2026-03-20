import { ErpShell } from "@/components/layout/erp-shell";
import { PreferencesProvider } from "@/providers/preferences-provider";

export default function ErpLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <PreferencesProvider>
      <ErpShell>{children}</ErpShell>
    </PreferencesProvider>
  );
}
