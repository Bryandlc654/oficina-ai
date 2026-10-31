import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "AI Virtual Office",
    template: "%s · AI Virtual Office",
  },
  description: "Oficina virtual privada con empleados de inteligencia artificial.",
  robots: { index: false, follow: false },
  icons: { icon: "/icon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body className="min-h-screen text-zinc-200 antialiased">{children}</body>
    </html>
  );
}
