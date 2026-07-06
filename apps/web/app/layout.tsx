import type { Metadata } from "next";
import { Archivo, Bebas_Neue } from "next/font/google";
import { SiteNav } from "@/components/app/site-nav";
import { SiteFooter } from "@/components/app/site-footer";
import "./globals.css";

const archivo = Archivo({ subsets: ["latin"], variable: "--font-sans" });
const bebas = Bebas_Neue({ weight: "400", subsets: ["latin"], variable: "--font-display" });

export const metadata: Metadata = {
  title: {
    default: "Oracle Property Intelligence",
    template: "%s — Oracle Property Intelligence",
  },
  description:
    "Lee County property intelligence over the Elephant open-data network: 511,695 provenance-tracked properties, permits, businesses, and contractors with source-cited answers.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${archivo.variable} ${bebas.variable}`}>
      <body className="flex min-h-screen flex-col">
        <SiteNav />
        <main className="flex-1">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
