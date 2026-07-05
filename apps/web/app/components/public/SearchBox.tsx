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
        className={`flex w-full items-center gap-2 rounded-xl border-2 border-orange-500 bg-white pl-4 pr-1.5 shadow-sm ${
          large ? "h-14" : "h-11"
        }`}
      >
        <Search size={large ? 20 : 16} className="shrink-0 text-slate-400" />
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Search products, suppliers, or categories..."
          className={`w-full flex-1 bg-transparent outline-none placeholder:text-slate-400 ${large ? "text-base" : "text-sm"}`}
        />
        <button
          type="submit"
          className={`shrink-0 rounded-lg bg-orange-500 font-semibold text-white transition hover:bg-orange-600 ${
            large ? "px-6 py-2.5 text-sm" : "px-4 py-1.5 text-xs"
          }`}
        >
          Search
        </button>
      </div>
    </form>
  );
}
