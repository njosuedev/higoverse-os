"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

// The public marketplace now lives at these paths (outside the private
// dashboard route group entirely) instead of under /marketplace.
const MARKETPLACE_PATHS = ["/products", "/categories", "/category", "/product", "/search", "/about", "/contact"];
function isMP(p: string) {
  if (p === "/") return true;
  return MARKETPLACE_PATHS.some((seg) => p === seg || p.startsWith(`${seg}/`));
}

export default function MarketplaceTransitionLoader() {
  const pathname    = usePathname();
  const [visible, setVisible]  = useState(false);
  const [fading,  setFading]   = useState(false);
  const prevRef    = useRef<string | null>(null);
  const hideTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fadeTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Show loader when transitioning INTO marketplace from a non-marketplace page
  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = pathname;

    if (prev === null) {
      // First render — enforce light mode silently if already on marketplace
      if (isMP(pathname)) document.documentElement.classList.remove("dark");
      return;
    }

    const entering = isMP(pathname) && !isMP(prev);

    if (entering) {
      // Remove dark mode immediately — the loader covers everything
      document.documentElement.classList.remove("dark");

      setFading(false);
      setVisible(true);

      if (hideTimer.current)  clearTimeout(hideTimer.current);
      if (fadeTimer.current)  clearTimeout(fadeTimer.current);

      // Start fade-out after 1.2 s, fully remove after another 300 ms
      hideTimer.current = setTimeout(() => {
        setFading(true);
        fadeTimer.current = setTimeout(() => setVisible(false), 300);
      }, 1200);
    }
  }, [pathname]);

  // Enforce light mode continuously while on marketplace
  useEffect(() => {
    if (!isMP(pathname)) return;
    document.documentElement.classList.remove("dark");
  }, [pathname]);

  // Cleanup
  useEffect(() => () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (fadeTimer.current) clearTimeout(fadeTimer.current);
  }, []);

  if (!visible) return null;

  return (
    <>
      <style>{`
        @keyframes mp-loader-spin { to { transform: rotate(360deg); } }
        @keyframes mp-loader-in   { from { opacity: 0; } to { opacity: 1; } }
      `}</style>
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 99999,
          background: "#ffffff",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          opacity: fading ? 0 : 1,
          transition: "opacity 0.28s ease",
          animation: "mp-loader-in 0.15s ease",
        }}
      >
        {/* Logo + spinner ring — Facebook page-switch style */}
        <div style={{ position: "relative", width: 76, height: 76 }}>
          {/* Static grey ring */}
          <div style={{
            position: "absolute", inset: 0, borderRadius: "50%",
            border: "3.5px solid #e8eaf0",
          }} />
          {/* Animated blue arc */}
          <div style={{
            position: "absolute", inset: 0, borderRadius: "50%",
            border: "3.5px solid transparent",
            borderTopColor: "#2563eb",
            animation: "mp-loader-spin 0.75s linear infinite",
          }} />
          {/* Brand logo in centre */}
          <div style={{
            position: "absolute", inset: 9,
            borderRadius: "50%",
            background: "#f8fafc",
            display: "flex", alignItems: "center", justifyContent: "center",
            overflow: "hidden",
          }}>
            <img
              src="/higoverse.png"
              alt="Higoverse"
              style={{ width: 46, height: 46, objectFit: "cover", borderRadius: 10 }}
            />
          </div>
        </div>

        {/* Label */}
        <p style={{
          fontSize: 11, fontWeight: 700, letterSpacing: "0.12em",
          color: "#94a3b8", textTransform: "uppercase", margin: 0,
        }}>
          Marketplace
        </p>
      </div>
    </>
  );
}
