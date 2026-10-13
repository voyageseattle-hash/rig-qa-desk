import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rig QA Desk — evidence to artist handoff",
  description: "Locate supported rig and animation export faults, review NVIDIA/Nebius investigation advice, and preserve evidence in an artist handoff.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
