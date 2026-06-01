import type { ReactNode } from "react";

export const metadata = {
  title: "Helmsman — Mission Control",
  description: "Observe and control agentic SDLC workflows.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
          background: "#0b0f17",
          color: "#e6edf3",
        }}
      >
        <header
          style={{
            padding: "12px 20px",
            borderBottom: "1px solid #21262d",
            fontWeight: 600,
            fontSize: 18,
          }}
        >
          ⎈ Helmsman · Mission Control{" "}
          <span style={{ color: "#7d8590", fontWeight: 400, fontSize: 13 }}>
            agentic SDLC control plane
          </span>
        </header>
        <main style={{ padding: 20 }}>{children}</main>
      </body>
    </html>
  );
}
