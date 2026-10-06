"use client";

// A light emoji picker for Messages: Recent first, then groups (smileys,
// gestures, business, objects, symbols), search by name, and it stays open
// for several picks (Esc or a click outside closes it). Recent ones are
// kept in this browser.

import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";

const GROUPS: { key: string; icon: string; list: [string, string][] }[] = [
  { key: "smileys", icon: "😀", list: [
    ["😀", "grin happy"], ["😃", "smile happy"], ["😄", "laugh happy"], ["😁", "beaming grin"], ["😆", "laughing"], ["😅", "sweat smile"],
    ["😂", "joy tears laugh"], ["🤣", "rofl laugh"], ["🙂", "slight smile"], ["😉", "wink"], ["😊", "blush smile"], ["😇", "angel innocent"],
    ["🥰", "love hearts"], ["😍", "heart eyes love"], ["🤩", "star struck"], ["😘", "kiss"], ["😋", "yum tasty"], ["😜", "wink tongue"],
    ["🤔", "thinking hmm"], ["🤨", "raised eyebrow"], ["😐", "neutral"], ["😶", "speechless"], ["🙄", "eye roll"], ["😏", "smirk"],
    ["😌", "relieved"], ["😔", "pensive sad"], ["😴", "sleeping"], ["🤒", "sick"], ["😎", "cool sunglasses"], ["🥳", "party celebrate"],
    ["😕", "confused"], ["😟", "worried"], ["😮", "wow surprised"], ["😲", "astonished"], ["🥺", "pleading"], ["😢", "cry sad"],
    ["😭", "sob cry"], ["😤", "triumph huff"], ["😠", "angry"], ["😡", "rage angry"], ["🤯", "mind blown"], ["😱", "scream fear"],
    ["🤗", "hug"], ["🤫", "shush quiet"], ["🤭", "oops giggle"], ["🫡", "salute"], ["🤝", "handshake deal"], ["😬", "grimace"],
  ] },
  { key: "gestures", icon: "👍", list: [
    ["👍", "thumbs up yes ok"], ["👎", "thumbs down no"], ["👌", "ok perfect"], ["✌️", "victory peace"], ["🤞", "fingers crossed luck"],
    ["🤙", "call me"], ["👋", "wave hello bye"], ["👏", "clap applause"], ["🙌", "raise hands hooray"], ["🙏", "pray thanks please"],
    ["💪", "strong muscle"], ["👉", "point right"], ["👈", "point left"], ["👆", "point up"], ["👇", "point down"], ["✋", "hand stop"],
    ["🤲", "palms up"], ["✍️", "writing sign"], ["👀", "eyes look"], ["🫶", "heart hands"],
  ] },
  { key: "business", icon: "💰", list: [
    ["💰", "money bag"], ["💵", "dollar cash"], ["💸", "money flying spend"], ["💳", "card payment"], ["🧾", "receipt"], ["📈", "chart up growth"],
    ["📉", "chart down"], ["📊", "bar chart report"], ["💹", "chart yen market"], ["🏦", "bank"], ["🏪", "shop store"], ["🛒", "cart shopping"],
    ["🛍️", "shopping bags"], ["📦", "package box stock"], ["🚚", "truck delivery"], ["🚗", "car"], ["🚙", "suv car"], ["🚘", "car oncoming"],
    ["🔑", "key"], ["🏷️", "tag price label"], ["📱", "phone mobile"], ["💻", "laptop computer"], ["🖨️", "printer print"], ["📞", "telephone call"],
    ["✉️", "envelope email"], ["📅", "calendar date"], ["⏰", "alarm clock time"], ["📍", "pin location"], ["🧮", "abacus count"], ["📝", "memo note"],
  ] },
  { key: "objects", icon: "🎉", list: [
    ["🎉", "party popper celebrate"], ["🎊", "confetti"], ["🎁", "gift present"], ["🏆", "trophy win"], ["⭐", "star"], ["🌟", "glowing star"],
    ["🔥", "fire hot"], ["💡", "idea bulb"], ["⚡", "lightning fast"], ["☕", "coffee"], ["🍽️", "meal food"], ["🌍", "world earth"],
    ["☀️", "sun"], ["🌧️", "rain"], ["📸", "camera photo"], ["🔒", "lock secure"], ["🛠️", "tools fix"], ["⚙️", "settings gear"],
  ] },
  { key: "symbols", icon: "❤️", list: [
    ["❤️", "red heart love"], ["💙", "blue heart"], ["💚", "green heart"], ["💛", "yellow heart"], ["🧡", "orange heart"], ["💜", "purple heart"],
    ["✅", "check done yes"], ["☑️", "checkbox"], ["❌", "cross no wrong"], ["⚠️", "warning"], ["❗", "exclamation important"], ["❓", "question"],
    ["💯", "hundred perfect"], ["🆗", "ok button"], ["🆕", "new"], ["🔴", "red circle"], ["🟢", "green circle"], ["🟡", "yellow circle"],
    ["➡️", "arrow right"], ["⬅️", "arrow left"], ["🔁", "repeat"], ["🔔", "bell notification"], ["📌", "pushpin"], ["✨", "sparkles"],
  ] },
];
const RECENT_KEY = "hgv_recent_emoji";

function readRecent(): string[] {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]"); } catch { return []; }
}

export default function EmojiPicker({ onPick, onClose, labels }: {
  onPick: (emoji: string) => void;
  onClose: () => void;
  labels: { search: string; recent: string; none: string; groups: Record<string, string> };
}) {
  const box = useRef<HTMLDivElement>(null);
  const [q, setQ] = useState("");
  const [recent, setRecent] = useState<string[]>(readRecent);

  useEffect(() => {
    const away = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) onClose(); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [onClose]);

  const found = useMemo(() => {
    const n = q.trim().toLowerCase();
    return n ? GROUPS.flatMap((g) => g.list).filter(([, name]) => name.includes(n)).map(([e]) => e) : null;
  }, [q]);

  function pick(e: string) {
    onPick(e);
    const next = [e, ...recent.filter((x) => x !== e)].slice(0, 24);
    setRecent(next);
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* storage blocked */ }
  }

  const grid = (list: string[]) => (
    <div className="grid grid-cols-8 gap-0.5">
      {list.map((e) => (
        <button key={e} type="button" onClick={() => pick(e)}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-[22px] leading-none transition hover:bg-slate-100">{e}</button>
      ))}
    </div>
  );

  return (
    <div ref={box} role="dialog" aria-label={labels.search}
      className="absolute bottom-14 left-2 z-30 w-[340px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
      <div className="p-2">
        <div className="flex items-center gap-2 rounded-lg bg-paper-dim px-3">
          <Search size={14} className="text-text-faint" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={labels.search}
            className="hgv-bare h-9 w-full border-0 bg-transparent text-sm outline-none" />
        </div>
      </div>
      <div className="max-h-72 overflow-y-auto px-2 pb-2">
        {found ? (found.length ? grid(found) : <p className="px-2 py-6 text-center text-sm text-text-faint">{labels.none}</p>) : (<>
          {recent.length > 0 && (<>
            <p className="px-1 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wider text-text-faint">{labels.recent}</p>
            {grid(recent)}
          </>)}
          {GROUPS.map((g) => (
            <div key={g.key}>
              <p className="px-1 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-text-faint">{labels.groups[g.key] ?? g.key}</p>
              {grid(g.list.map(([e]) => e))}
            </div>
          ))}
        </>)}
      </div>
    </div>
  );
}
