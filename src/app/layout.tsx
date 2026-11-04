import "./globals.css";
import type { ReactNode } from "react";
export const metadata = { title: "BusinessOS AI — E-commerce Profit Intelligence", description: "Pakistan-first finance and profit intelligence for e-commerce sellers." };
export default function RootLayout({ children }: { children: ReactNode }) {
  return (<html lang="en"><body>{children}</body></html>);
}
