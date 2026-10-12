"use client";

import { useEffect } from "react";

// On phones a wide table shows only its first column and its buttons; the
// figures that matter (price, quantity, total) sit off to the side. Instead,
// globals.css ("TABLES AS CARDS") lays each row out as a card: the main
// cell as its title, every other cell on its own line under its column
// name, the row's buttons at the bottom. This labels the cells for it:
// each cell gets its column's name (data-label) and a role, read from the
// table's header, so the pages keep writing ordinary tables. A cell with
// nothing but a dash in it is marked data-empty and left off the card. A
// table opts out with the class "hgv-table-keep"; a header cell can name
// the card's title column with data-primary.
const TABLES = ".overflow-x-auto > table:not(.hgv-table-keep)";

function label(table: HTMLTableElement) {
  const head = table.tHead?.rows[table.tHead.rows.length - 1];
  if (!head) return;
  const names: string[] = [];
  let primary = -1;
  for (const th of Array.from(head.cells)) {
    const text = (th.textContent || "").replace(/\s+/g, " ").trim();
    if (th.hasAttribute("data-primary")) primary = names.length;
    for (let i = 0; i < th.colSpan; i++) names.push(text);
  }
  // The title: the marked column, else the first one that isn't a row number.
  if (primary < 0) primary = names.findIndex((n) => n !== "" && n !== "#");
  const last = names.length - 1;

  table.classList.add("hgv-cards");
  for (const body of [...Array.from(table.tBodies), ...(table.tFoot ? [table.tFoot] : [])]) {
    for (const tr of Array.from(body.rows)) {
      let col = 0;
      for (const td of Array.from(tr.cells)) {
        const span = td.colSpan;
        const name = names[col] ?? "";
        const role =
          span > 1 || tr.cells.length === 1 ? "span"
          : name === "#" ? "num"
          : col === primary ? "primary"
          : col === last && td.querySelector("button, a") ? "actions"
          : "";
        if (td.dataset.role !== role) td.dataset.role = role;
        // Nothing but a dash: the card leaves the line out.
        const blank = role === "" && /^[-–—]?$/.test((td.textContent || "").trim()) && !td.querySelector("img, button, a, input, svg");
        if (blank !== td.hasAttribute("data-empty")) td.toggleAttribute("data-empty", blank);
        const want = role === "" && name ? name : null;
        if (want === null) { if (td.hasAttribute("data-label")) td.removeAttribute("data-label"); }
        else if (td.dataset.label !== want) td.dataset.label = want;
        col += span;
      }
    }
  }
}

export default function TableCards() {
  useEffect(() => {
    let frame = 0;
    const run = () => {
      frame = 0;
      document.querySelectorAll<HTMLTableElement>(TABLES).forEach(label);
    };
    const soon = () => { if (!frame) frame = requestAnimationFrame(run); };
    run();
    // Rows come and go as data loads, pages change and filters apply.
    const watch = new MutationObserver(soon);
    watch.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => { watch.disconnect(); if (frame) cancelAnimationFrame(frame); };
  }, []);
  return null;
}
