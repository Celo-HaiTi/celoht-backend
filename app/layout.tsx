import type { Metadata } from "next";
import "./governance/governance.css";

export const metadata: Metadata = {
  title: "CeloHT Governance",
  description: "CeloHT community governance on Celo Sepolia.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}