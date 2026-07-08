import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

/**
 * DESIGN.md specifies Inter exclusively ("leverage its exceptional
 * legibility in data-heavy SaaS environments"). We load the variable font
 * once here and expose it as `--font-inter`, which `globals.css` maps to
 * Tailwind's `--font-sans` theme key.
 */
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

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
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-background text-on-background">
        {children}
      </body>
    </html>
  );
}
