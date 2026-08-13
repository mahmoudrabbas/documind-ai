import type { Metadata } from "next";
import { I18nProvider } from "@/providers/i18n-provider";
import { AuthProvider } from "@/providers/auth-provider";
import { PermissionProvider } from "@/providers/permission-provider";
import { TenantProvider } from "@/providers/tenant-provider";
import { ToastProvider } from "@/providers/toast-provider";
import { Toaster } from "@/components/ui/Toaster";
import "./globals.css";

export const metadata: Metadata = {
  title: "DocuMind AI",
  description: "Enterprise knowledge assistant for company documents.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" dir="ltr" className="h-full antialiased">
      <head>
        <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-full flex flex-col bg-background text-on-background font-sans">
        <I18nProvider><AuthProvider><PermissionProvider><TenantProvider><ToastProvider>{children}<Toaster /></ToastProvider></TenantProvider></PermissionProvider></AuthProvider></I18nProvider>
      </body>
    </html>
  );
}
