import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "CeloHT Administration",
  description: "Role-protected CeloHT review and administration tools.",
};

export default function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}