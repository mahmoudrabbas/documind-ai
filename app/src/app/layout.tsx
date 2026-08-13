import type { Metadata } from "next";
import { cookies } from "next/headers";
import { I18nProvider } from "@/providers/i18n-provider";
import { AuthProvider } from "@/providers/auth-provider";
import { PermissionProvider } from "@/providers/permission-provider";
import { TenantProvider } from "@/providers/tenant-provider";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE_NAME,
  getDirection,
  isValidLocale,
} from "@/lib/i18n";
import { cairo } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "DocuMind AI",
  description: "Enterprise knowledge assistant for company documents.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  /* Resolve the locale on the server so `lang`/`dir` are correct in the
     very first byte of HTML. Reading it client-side instead produced a
     visible LTR flash on every load for Arabic users. */
  const cookieStore = await cookies();
  const persisted = cookieStore.get(LOCALE_COOKIE_NAME)?.value;
  const locale = isValidLocale(persisted) ? persisted : DEFAULT_LOCALE;
  const dir = getDirection(locale);

  return (
    <html
      lang={locale}
      dir={dir}
      className={`h-full antialiased ${cairo.variable}`}
      suppressHydrationWarning
    >
      <head>
        <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet" />
      </head>
      {/* `font-sans` is intentionally omitted: the base layer already sets
          the body font, and a utility class would outrank the RTL Arabic
          override in globals.css (Tailwind v4 orders utilities after base). */}
      <body
        className="min-h-full flex flex-col bg-background text-on-background"
        suppressHydrationWarning
      >
        <I18nProvider initialLocale={locale}><AuthProvider><PermissionProvider><TenantProvider>{children}</TenantProvider></PermissionProvider></AuthProvider></I18nProvider>
      </body>
    </html>
  );
}
