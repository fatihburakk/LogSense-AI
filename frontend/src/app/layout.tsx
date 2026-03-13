import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LogSense AI — Akıllı Sistem Gözlemleme",
  description:
    "Gerçek zamanlı log analizi, anomali tespiti ve akıllı uyarı dashboard'u",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr">
      <body>{children}</body>
    </html>
  );
}
