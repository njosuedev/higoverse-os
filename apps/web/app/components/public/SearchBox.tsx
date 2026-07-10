"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

export default function SearchBox({ defaultValue = "", large = false }: { defaultValue?: string; large?: boolean }) {
  const [value, setValue] = useState(defaultValue);
  const router = useRouter();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const q = value.trim();
    router.push(q ? `/search?q=${encodeURIComponent(q)}` : "/search");
  }

  return (
    <form onSubmit={submit} className="flex w-full">
      <div
        className={`flex w-full items-center gap-1.5 rounded-lg border border-orange-500 bg-white pl-2.5 pr-1 shadow-sm sm:gap-2 sm:rounded-xl sm:border-2 sm:pl-4 sm:pr-1.5 ${
          large ? "h-10 sm:h-14" : "h-9 sm:h-11"
        }`}
      >
        <Search size={large ? 16 : 14} className="shrink-0 text-slate-400 sm:h-5 sm:w-5" />
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Search products, suppliers, or categories..."
          className={`w-full flex-1 bg-transparent text-xs outline-none placeholder:text-slate-400 ${large ? "sm:text-base" : "sm:text-sm"}`}
        />
        <button
          type="submit"
          className={`shrink-0 rounded-md bg-orange-500 text-[11px] font-semibold text-white transition hover:bg-orange-600 sm:rounded-lg ${
            large ? "px-3.5 py-1.5 sm:px-6 sm:py-2.5 sm:text-sm" : "px-2.5 py-1 sm:px-4 sm:py-1.5 sm:text-xs"
          }`}
        >
          Search
        </button>
      </div>
    </form>
  );
}
