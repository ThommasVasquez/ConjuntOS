import AppShell from "@/components/shell/AppShell";
import { Providers } from "@/components/Providers";

export default function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <Providers>
      <AppShell>
        {children}
      </AppShell>
    </Providers>
  );
}
