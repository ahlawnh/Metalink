import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "D/SPATCH",
  description: "D/SPATCH caller link",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
