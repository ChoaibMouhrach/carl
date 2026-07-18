import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { cn } from "@repo/ui/utils";

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "SaaS Template — Build what only you can build",
  description: "A clean, typed foundation for building focused SaaS products.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={cn("h-full antialiased", geist.variable)}>
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
