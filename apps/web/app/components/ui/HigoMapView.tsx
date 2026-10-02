"use client";

import { useEffect, useRef } from "react";

interface Props {
  lat: number;
  lng: number;
  height?: number;
  zoom?: number;
}

const TILE_URL = "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";

const PIN_HTML = `
  <div style="position:relative;width:32px;height:44px;filter:drop-shadow(0 3px 6px rgba(0,0,0,0.35));">
    <svg viewBox="0 0 32 44" xmlns="http://www.w3.org/2000/svg" width="32" height="44">
      <path d="M16 0C7.163 0 0 7.163 0 16c0 10.5 16 28 16 28S32 26.5 32 16C32 7.163 24.837 0 16 0z"
            fill="#0a66c2" stroke="#fff" stroke-width="2"/>
      <circle cx="16" cy="16" r="6" fill="#fff"/>
      <circle cx="16" cy="16" r="3.5" fill="#0a66c2"/>
    </svg>
  </div>`;

export default function HigoMapView({ lat, lng, height = 220, zoom = 17 }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInst = useRef<import("leaflet").Map | null>(null);

  useEffect(() => {
    let gone = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (!mapRef.current || gone) return;

      const map = L.map(mapRef.current, {
        zoomControl: false,
        attributionControl: false,
        dragging: false,
        scrollWheelZoom: false,
        doubleClickZoom: false,
        touchZoom: false,
        keyboard: false,
        boxZoom: false,
      }).setView([lat, lng], zoom);

      L.tileLayer(TILE_URL, { attribution: "", maxZoom: 20 }).addTo(map);

      const icon = L.divIcon({
        className: "",
        html: PIN_HTML,
        iconSize: [32, 44],
        iconAnchor: [16, 44],
        popupAnchor: [0, -44],
      });

      L.marker([lat, lng], { icon }).addTo(map);
      mapInst.current = map;
    })();

    return () => {
      gone = true;
      mapInst.current?.remove();
      mapInst.current = null;
    };
  }, [lat, lng, zoom]);

  return (
    <>
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <div ref={mapRef} style={{ width: "100%", height }} />
    </>
  );
}
