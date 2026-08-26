import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "F4milia",
  description: "Community platform for caregivers and mentors.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      {/* Browser extensions (Grammarly, password managers) add attributes to
          <body> before hydration; suppression is one level deep, so real
          mismatches inside the tree still surface. */}
      <body
        className="min-h-full flex flex-col bg-canvas text-ink"
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}
