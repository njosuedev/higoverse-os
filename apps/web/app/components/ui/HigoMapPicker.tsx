"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { MapPin, Search, Navigation, Check, Loader2, X, AlertCircle } from "lucide-react";
import { useLanguage } from "@/lib/language-context";

export interface LatLng { lat: number; lng: number; }

interface Props {
  initialLat?: number | null;
  initialLng?: number | null;
  onConfirm: (pos: LatLng, label: string) => void;
  onClose: () => void;
}

// Rwanda geographic constants
const RWANDA        = { lat: -1.9403, lng: 29.8739 };
const RWANDA_BOUNDS = [[-2.9, 28.7], [-1.0, 31.0]] as [[number, number], [number, number]];
const ZOOM_RW  = 9;
const ZOOM_MIN = 8;   // don't let user zoom out past country level
const ZOOM_PIN = 17;
const TILE_URL = "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";

// SVG teardrop pin — same style as HigoMapView
const PIN_HTML = `
  <div style="filter:drop-shadow(0 3px 6px rgba(0,0,0,0.35));">
    <svg viewBox="0 0 32 44" xmlns="http://www.w3.org/2000/svg" width="36" height="50">
      <path d="M16 0C7.163 0 0 7.163 0 16c0 10.5 16 28 16 28S32 26.5 32 16C32 7.163 24.837 0 16 0z"
            fill="#0a66c2" stroke="#fff" stroke-width="2"/>
      <circle cx="16" cy="16" r="6" fill="#fff"/>
      <circle cx="16" cy="16" r="3.5" fill="#0a66c2"/>
    </svg>
  </div>`;

type NomResult = { display_name: string; lat: string; lon: string };

export default function HigoMapPicker({ initialLat, initialLng, onConfirm, onClose }: Props) {
  const { t } = useLanguage();
  const mapRef      = useRef<HTMLDivElement>(null);
  const leafMap     = useRef<import("leaflet").Map | null>(null);
  const markerRef   = useRef<import("leaflet").Marker | null>(null);
  const circleRef   = useRef<import("leaflet").Circle | null>(null);
  const watchIdRef  = useRef<number | null>(null);
  // Shared place-marker function exposed from the Leaflet closure
  const placeAtRef  = useRef<((lat: number, lng: number) => void) | null>(null);
  const debounceT   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef    = useRef<AbortController | null>(null);

  const hasPinInit = initialLat != null && initialLng != null;

  const [pos,        setPos]        = useState<LatLng>(hasPinInit ? { lat: initialLat!, lng: initialLng! } : RWANDA);
  const [label,      setLabel]      = useState("");
  const [search,     setSearch]     = useState("");
  const [searching,  setSearching]  = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError,   setGeoError]   = useState("");
  const [geoAccuracy,setGeoAccuracy]= useState<number | null>(null); // metres
  const [pinSet,     setPinSet]     = useState(hasPinInit);
  const [results,    setResults]    = useState<NomResult[]>([]);
  const [noResults,  setNoResults]  = useState(false);

  // ── Reverse geocode ──────────────────────────────────────────────────────
  async function rev(lat: number, lng: number) {
    try {
      const r = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=18`,
        { headers: { "Accept-Language": "en", "User-Agent": "Higoverse/1.0"} }
      );
      const d = await r.json();
      if (d?.display_name) setLabel(d.display_name);
    } catch { /* non-fatal */ }
  }

  // ── Init Leaflet — exposes placeAt via ref so any caller can use it ─────
  useEffect(() => {
    let gone = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (!mapRef.current || gone) return;

      const start = hasPinInit ? { lat: initialLat!, lng: initialLng! } : RWANDA;
      const map = L.map(mapRef.current, {
        zoomControl: true,
        attributionControl: false,
        minZoom: ZOOM_MIN,
        maxBounds: RWANDA_BOUNDS,
        maxBoundsViscosity: 0.85,
      }).setView([start.lat, start.lng], hasPinInit ? ZOOM_PIN : ZOOM_RW);

      L.tileLayer(TILE_URL, { attribution: "", maxZoom: 20 }).addTo(map);

      const makeIcon = () =>
        L.divIcon({ className: "", html: PIN_HTML, iconSize: [36, 50], iconAnchor: [18, 50], popupAnchor: [0, -52] });

      let marker: import("leaflet").Marker | null = null;

      // ← single source of truth for placing / moving the pin
      function placeAt(lat: number, lng: number) {
        if (marker) {
          marker.setLatLng([lat, lng]);
        } else {
          marker = L.marker([lat, lng], { draggable: true, icon: makeIcon() }).addTo(map);
          marker.on("dragend", () => {
            const p = marker!.getLatLng();
            setPos({ lat: p.lat, lng: p.lng });
            rev(p.lat, p.lng);
          });
          markerRef.current = marker;
        }
        setPos({ lat, lng });
        setPinSet(true);
        rev(lat, lng);
      }

      // Expose to outside the effect
      placeAtRef.current = placeAt;

      if (hasPinInit) placeAt(initialLat!, initialLng!);
      map.on("click", (e) => placeAt(e.latlng.lat, e.latlng.lng));
      leafMap.current = map;
    })();

    return () => {
      gone = true;
      placeAtRef.current = null;
      if (watchIdRef.current != null) navigator.geolocation?.clearWatch(watchIdRef.current);
      leafMap.current?.remove();
      leafMap.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Live search ──────────────────────────────────────────────────────────
  const liveSearch = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); setNoResults(false); return; }
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setSearching(true); setNoResults(false);
    try {
      const r = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&countrycodes=rw&format=json&limit=6&addressdetails=1`,
        { headers: { "Accept-Language": "en", "User-Agent": "Higoverse/1.0"}, signal: ctrl.signal }
      );
      const d: NomResult[] = await r.json();
      setResults(d ?? []);
      setNoResults(!d?.length);
    } catch (e: unknown) {
      if (e instanceof Error && e.name !== "AbortError") setNoResults(true);
    } finally { setSearching(false); }
  }, []);

  function onSearchChange(val: string) {
    setSearch(val);
    if (debounceT.current) clearTimeout(debounceT.current);
    debounceT.current = setTimeout(() => liveSearch(val), 350);
  }

  function clearSearch() {
    setSearch(""); setResults([]); setNoResults(false);
    abortRef.current?.abort();
  }

  // ── Fly to search result — uses shared placeAt ───────────────────────────
  function flyTo(r: NomResult) {
    const lat = parseFloat(r.lat);
    const lng = parseFloat(r.lon);
    clearSearch();
    leafMap.current?.flyTo([lat, lng], ZOOM_PIN, { duration: 0.9 });
    // placeAt also calls setPos + rev, so state stays in sync
    placeAtRef.current?.(lat, lng);
  }

  // ── GPS location — watchPosition improves accuracy progressively ─────────
  function useMyLocation() {
    setGeoError(""); setGeoAccuracy(null);

    if (!navigator.geolocation) {
      setGeoError(t("map.err_unsupported"));
      return;
    }
    if (typeof window !== "undefined" &&
        window.location.protocol === "http:" &&
        window.location.hostname !== "localhost" &&
        window.location.hostname !== "127.0.0.1") {
      setGeoError(t("map.err_insecure"));
      return;
    }

    // Stop any previous watch
    if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current);

    setGeoLoading(true);

    // Auto-stop after 20 s
    const stopTimer = setTimeout(() => {
      if (watchIdRef.current != null) { navigator.geolocation.clearWatch(watchIdRef.current); watchIdRef.current = null; }
      setGeoLoading(false);
    }, 20000);

    watchIdRef.current = navigator.geolocation.watchPosition(
      async ({ coords: { latitude: lat, longitude: lng, accuracy } }) => {
        setGeoAccuracy(Math.round(accuracy));

        // Draw / update accuracy circle
        const L = (await import("leaflet")).default;
        if (circleRef.current) {
          circleRef.current.setLatLng([lat, lng]);
          circleRef.current.setRadius(accuracy);
        } else if (leafMap.current) {
          circleRef.current = L.circle([lat, lng], {
            radius: accuracy,
            color: "#0a66c2", fillColor: "#0a66c2",
            fillOpacity: 0.08, weight: 1.5,
          }).addTo(leafMap.current);
        }

        // Move map & pin
        leafMap.current?.panTo([lat, lng], { animate: true });
        placeAtRef.current?.(lat, lng);

        // Good enough — stop watching
        if (accuracy <= 100) {
          navigator.geolocation.clearWatch(watchIdRef.current!);
          watchIdRef.current = null;
          clearTimeout(stopTimer);
          setGeoLoading(false);
        }
      },
      (err) => {
        clearTimeout(stopTimer);
        setGeoLoading(false);
        if (watchIdRef.current != null) { navigator.geolocation.clearWatch(watchIdRef.current); watchIdRef.current = null; }
        if (err.code === 1) setGeoError(t("map.err_denied"));
        else if (err.code === 2) setGeoError(t("map.err_unavailable"));
        else setGeoError(t("map.err_timeout"));
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  }

  const showDropdown = results.length > 0 || (noResults && search.length >= 2);

  return (
    <>
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />

      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col overflow-hidden" style={{ maxHeight: "90vh" }}>

          {/* Header */}
          <div className="hgv-surface !border-0 !border-b !border-border flex items-center justify-between px-5 py-3.5" style={{ background: "linear-gradient(135deg,#0a66c2 0%,#0a58ca 100%)" }}>
            <div className="flex items-center gap-3 text-white">
              <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center">
                <MapPin size={16} />
              </div>
              <div>
                <p className="font-extrabold text-sm tracking-tight">{t("map.title")}</p>
                <p className="text-blue-200 text-[11px]">{t("map.subtitle")}</p>
              </div>
            </div>
            <button onClick={onClose} className="w-7 h-7 rounded-lg bg-white/15 hover:bg-white/30 flex items-center justify-center text-white transition">
              <X size={14} />
            </button>
          </div>

          {/* Search bar */}
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 relative z-10">
            <div className="flex gap-2">
              <div className="relative flex-1">
                {searching
                  ? <Loader2 size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#0a66c2] animate-spin" />
                  : <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                }
                <input
                  value={search}
                  onChange={(e) => onSearchChange(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Escape") clearSearch(); }}
                  placeholder={t("map.search_placeholder")}
                  autoComplete="off"
                  className="w-full pl-9 pr-8 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition"
                />
                {search && (
                  <button onClick={clearSearch} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500 transition">
                    <X size={13} />
                  </button>
                )}
              </div>

              {/* My Location button */}
              <button
                type="button"
                onClick={useMyLocation}
                disabled={geoLoading}
                title={t("map.use_gps_title")}
                className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-600 text-xs font-bold hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 transition flex items-center gap-1.5 disabled:opacity-50 shrink-0"
              >
                {geoLoading
                  ? <><Loader2 size={13} className="animate-spin text-blue-500" /> {t("map.locating")}</>
                  : <><Navigation size={13} className="text-[#0a66c2]" /> {t("map.my_location")}</>
                }
              </button>
            </div>

            {/* Accuracy / error feedback */}
            {geoError && (
              <div className="mt-2 flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                <AlertCircle size={13} className="shrink-0 mt-0.5" />
                <span>{geoError}</span>
              </div>
            )}
            {!geoError && geoAccuracy != null && (
              <div className={`mt-2 flex items-center gap-2 text-xs rounded-lg px-3 py-1.5 ${geoAccuracy <= 100 ? "bg-emerald-50 border border-emerald-200 text-emerald-700" : "bg-amber-50 border border-amber-200 text-amber-700"}`}>
                <Navigation size={11} className="shrink-0" />
                {geoAccuracy <= 100
                  ? `${t("map.good_fix_label")} ±${geoAccuracy} m`
                  : `${t("map.coarse_fix_label")} (±${geoAccuracy} m) — ${t("map.coarse_fix_hint")}`}
              </div>
            )}

            {/* Live results dropdown */}
            {showDropdown && (
              <div className="absolute left-4 right-4 top-full mt-0.5 bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden">
                {results.map((r, i) => (
                  <button key={i} onClick={() => flyTo(r)}
                    className="w-full text-left px-4 py-2.5 hover:bg-blue-50 text-sm text-slate-700 border-b border-slate-50 last:border-0 transition flex items-start gap-2.5">
                    <MapPin size={13} className="text-[#0a66c2] mt-0.5 shrink-0" />
                    <span className="line-clamp-1">{r.display_name}</span>
                  </button>
                ))}
                {noResults && (
                  <p className="px-4 py-3 text-sm text-slate-400 text-center">{t("map.no_results")}</p>
                )}
              </div>
            )}
          </div>

          {/* Map */}
          <div className="relative flex-1" style={{ minHeight: 320 }}>
            <div ref={mapRef} style={{ width: "100%", height: "100%", minHeight: 320 }} />
            {!pinSet && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-white/95 backdrop-blur border border-slate-200 rounded-full px-4 py-2 text-xs font-semibold text-slate-600 shadow-lg pointer-events-none flex items-center gap-2 whitespace-nowrap">
                <MapPin size={11} className="text-[#0a66c2]" /> {t("map.click_to_place")}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-5 py-3.5 border-t border-slate-100">
            {pinSet && (
              <div className="mb-3 flex items-start gap-2.5 bg-[#EBF2FD] border border-blue-100 rounded-xl px-3.5 py-2.5">
                <MapPin size={14} className="text-[#0a66c2] mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wide mb-0.5">{t("map.pinned_location")}</p>
                  <p className="text-xs font-bold text-slate-800 line-clamp-2">{label || t("map.location_selected")}</p>
                  <p className="text-[10px] text-slate-400 font-mono mt-0.5">{pos.lat.toFixed(6)}, {pos.lng.toFixed(6)}</p>
                </div>
              </div>
            )}
            <div className="flex items-center justify-end gap-2">
              <button onClick={onClose}
                className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition">
                {t("common.cancel")}
              </button>
              <button
                onClick={() => { if (pinSet) onConfirm(pos, label); }}
                disabled={!pinSet}
                className="px-5 py-2 rounded-xl text-white text-sm font-bold transition flex items-center gap-2 disabled:opacity-40"
                style={{ background: "#0a66c2" }}>
                <Check size={14} /> {t("map.confirm_location")}
              </button>
            </div>
          </div>

        </div>
      </div>
    </>
  );
}
