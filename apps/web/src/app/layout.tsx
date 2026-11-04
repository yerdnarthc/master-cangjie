import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MasterCangjie | Coding Practice",
  description: "Learn Cangjie through coding practice.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `try { if (localStorage.getItem("mastercangjie-theme") === "light") document.documentElement.dataset.theme = "light"; } catch {}` }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
