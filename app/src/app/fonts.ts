import localFont from "next/font/local";

/**
 * Arabic typeface.
 *
 * The default `--font-sans` stack is system-only and carries no Arabic
 * face, so Arabic text renders in whatever the OS happens to pick. Cairo
 * is loaded from the repository as a CSS variable and applied to
 * `html[dir="rtl"]` from
 * `globals.css`, leaving the English layout untouched.
 *
 * The `latin` subset is included deliberately: Arabic screens still show
 * plenty of Latin text (email addresses, tenant IDs, file types, code),
 * and Cairo covers those glyphs so mixed runs stay visually consistent.
 * The system stack remains behind it as the fallback.
 */
export const cairo = localFont({
  src: "./fonts/Cairo-Variable.ttf",
  display: "swap",
  variable: "--font-arabic",
  weight: "200 1000",
  style: "normal",
});
