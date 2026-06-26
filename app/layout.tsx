import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bet Ledger",
  description: "Private group ledger for bets and transfers",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="wrap">{children}</div>
      </body>
    </html>
  );
}
