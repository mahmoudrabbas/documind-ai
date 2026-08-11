import { Cairo } from "next/font/google";

/**
 * Arabic typeface.
 *
 * The default `--font-sans` stack is system-only and carries no Arabic
 * face, so Arabic text renders in whatever the OS happens to pick. Cairo
 * is loaded as a CSS variable and applied to `html[dir="rtl"]` from
 * `globals.css`, leaving the English layout untouched.
 *
 * The `latin` subset is included deliberately: Arabic screens still show
 * plenty of Latin text (email addresses, tenant IDs, file types, code),
 * and Cairo covers those glyphs so mixed runs stay visually consistent.
 * The system stack remains behind it as the fallback.
 */
export const cairo = Cairo({
  subsets: ["arabic", "latin"],
  display: "swap",
  variable: "--font-arabic",
});
