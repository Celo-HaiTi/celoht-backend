import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "CeloHT Profile",
  description: "Your verified CeloHT wallet profile and account activity.",
};

export default function ProfileLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}