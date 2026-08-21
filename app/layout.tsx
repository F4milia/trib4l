import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "F4milia",
  description: "Community platform for caregivers and mentors.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-canvas text-ink">{children}</body>
    </html>
  );
}
