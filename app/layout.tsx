import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Playfair_Display } from "next/font/google";
import "./globals.css";

/**
 * The three type voices of f4milia-design-system.md 3.1. The doc notes the
 * source repo loaded no webfonts and both serif and mono fell through to
 * platform defaults -- but that "the design depends on the serif/mono
 * contrast", so they are bound here for real.
 *
 * next/font self-hosts these at build time: no runtime request to Google,
 * no layout shift from a late swap, and nothing for a font CDN to log.
 *
 * Display is Playfair Display because the global h1-h6 rule (3.2) demands
 * font-weight 900 and Playfair's variable axis reaches it. Micro is
 * JetBrains Mono; its variable axis stops at 800, so `font-black` on mono
 * labels clamps one step down -- the closest available to the 900 that 3.3
 * specifies, and closer than IBM Plex Mono's 700 ceiling.
 */
const playfairDisplay = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jetBrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "F4milia",
  description: "Community platform for caregivers and mentors.",
};

/**
 * Parchment only, deliberately. §9 asks for theme-color on both themes, but
 * the app has no dark theme: the tokens exist (§2.3) and nothing activates
 * them, and the run doc schedules no dark-mode session in any wave.
 *
 * Declaring a dark theme-color anyway gave a dark-preference visitor a dark
 * browser toolbar above a parchment page. The dark entry lands with §2.7's
 * token block, not before it.
 */
export const viewport: Viewport = {
  themeColor: "#f7f4f0",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`h-full bg-parchment antialiased ${playfairDisplay.variable} ${inter.variable} ${jetBrainsMono.variable}`}
    >
      {/* Browser extensions (Grammarly, password managers) add attributes to
          <body> before hydration; suppression is one level deep, so real
          mismatches inside the tree still surface. */}
      <body
        className="min-h-full flex flex-col bg-parchment text-deep-slate"
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}
