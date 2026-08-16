import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Customer Operations Platform",
  description:
    "Multi-tenant SaaS platform for AI-powered customer operations and WhatsApp AI receptionist",
  generator: "Next.js",
  keywords: ["SaaS", "AI", "Customer Operations", "WhatsApp", "Receptionist"],
  viewport: "width=device-width, initial-scale=1, maximum-scale=5",
  authors: [{ name: "AI Customer Operations Platform" }],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
