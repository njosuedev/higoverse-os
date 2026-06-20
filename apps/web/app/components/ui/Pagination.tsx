"use client";

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

interface Props {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  pageSizes?: number[];
  onPage: (p: number) => void;
  onPageSize: (s: number) => void;
}

function pages(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const result: (number | "…")[] = [1];
  if (current > 3) result.push("…");
  for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) result.push(i);
  if (current < total - 2) result.push("…");
  result.push(total);
  return result;
}

export default function Pagination({
  page, totalPages, total, pageSize, pageSizes = [25, 50, 100, 250],
  onPage, onPageSize,
}: Props) {
  if (totalPages <= 1 && total <= pageSizes[0]) return null;

  const from = Math.min((page - 1) * pageSize + 1, total);
  const to   = Math.min(page * pageSize, total);

  const btn = "w-8 h-8 flex items-center justify-center rounded-lg text-sm transition";
  const active = "bg-[#1372e6] text-white font-semibold";
  const inactive = "text-slate-500 hover:bg-slate-100";
  const disabled = "text-slate-300 cursor-not-allowed";

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-slate-100 bg-white rounded-b-xl">
      {/* record count */}
      <div className="flex items-center gap-3 text-xs text-slate-500">
        <span>
          Showing <span className="font-semibold text-slate-700">{total === 0 ? 0 : from}–{to}</span> of{" "}
          <span className="font-semibold text-slate-700">{total.toLocaleString()}</span> records
        </span>
        <select
          value={pageSize}
          onChange={(e) => { onPageSize(Number(e.target.value)); onPage(1); }}
          className="border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-600 focus:outline-none focus:ring-2 focus:ring-slate-300"
        >
          {pageSizes.map((s) => <option key={s} value={s}>{s} per page</option>)}
        </select>
      </div>

      {/* page nav */}
      {totalPages > 1 && (
        <div className="flex items-center gap-0.5">
          <button onClick={() => onPage(1)} disabled={page === 1} className={`${btn} ${page === 1 ? disabled : inactive}`}>
            <ChevronsLeft size={14} />
          </button>
          <button onClick={() => onPage(page - 1)} disabled={page === 1} className={`${btn} ${page === 1 ? disabled : inactive}`}>
            <ChevronLeft size={14} />
          </button>
          {pages(page, totalPages).map((p, i) =>
            p === "…" ? (
              <span key={`ellipsis-${i}`} className="w-8 text-center text-slate-400 text-sm">…</span>
            ) : (
              <button key={p} onClick={() => onPage(p as number)} className={`${btn} ${p === page ? active : inactive}`}>
                {p}
              </button>
            )
          )}
          <button onClick={() => onPage(page + 1)} disabled={page === totalPages} className={`${btn} ${page === totalPages ? disabled : inactive}`}>
            <ChevronRight size={14} />
          </button>
          <button onClick={() => onPage(totalPages)} disabled={page === totalPages} className={`${btn} ${page === totalPages ? disabled : inactive}`}>
            <ChevronsRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
