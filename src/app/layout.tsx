import type { Metadata } from "next";
import Link from "next/link";
import "@cesium/widgets/Source/widgets.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "XAsset Command Center",
  description: "Monitoring aset perusahaan berbasis peta 3D dan layout DXF",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body>
        <a className="skip-link" href="#main-content">
          Lewati ke konten utama
        </a>
        <div id="main-content" className="site-content">{children}</div>
        <footer className="app-footer">
          <div className="footer-brand">
            <strong>XASSET</strong>
            <span>Asset Intelligence Platform</span>
          </div>
          <nav aria-label="Navigasi footer">
            <Link href="/">Dashboard</Link>
            <Link href="/assets">Data Aset</Link>
            <Link href="/dxf">DXF</Link>
          </nav>
          <small>© {new Date().getFullYear()} XAsset · Sistem informasi aset terintegrasi</small>
        </footer>
      </body>
    </html>
  );
}
