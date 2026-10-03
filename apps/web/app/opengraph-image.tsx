import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { SITE } from "@/lib/site";

export const alt = `${SITE.name} · ${SITE.shortTitle}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// 1200×630 social preview card (the square logo alone gets cropped badly
// by Facebook / LinkedIn / WhatsApp / X).
export default async function Image() {
  const logo = await readFile(join(process.cwd(), "public/higoverse-logo.png"));
  const logoSrc = `data:image/png;base64,${logo.toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%", display: "flex", flexDirection: "column",
          justifyContent: "space-between", padding: "72px 80px",
          background: SITE.background, color: "#191919",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoSrc} width={72} height={72} alt="" style={{ borderRadius: 14 }} />
          <span style={{ fontSize: 40, fontWeight: 700 }}>{SITE.name}</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ fontSize: 68, fontWeight: 700, lineHeight: 1.1 }}>Everything your shop needs,</span>
          <span style={{ fontSize: 68, fontWeight: 700, lineHeight: 1.1, color: SITE.themeColor }}>in one place.</span>
          <span style={{ fontSize: 30, color: "#666666", marginTop: 28 }}>
            Inventory · Sales · Purchases · Expenses · Debts · Reports
          </span>
        </div>
        <div style={{ display: "flex", height: 10, width: 160, background: SITE.themeColor, borderRadius: 5 }} />
      </div>
    ),
    size,
  );
}
