"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { translate, type Lang } from "./i18n";
import { isAuthenticated } from "./auth";
import { settingsRequest } from "./settings-api";

interface LanguageContextValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextValue>({
  lang: "en",
  setLang: () => {},
  t: (key) => key,
});

const VALID: Lang[] = ["en", "rw", "fr", "sw", "zh"];

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");

  useEffect(() => {
    const stored = localStorage.getItem("app_lang") as Lang | null;
    if (stored && VALID.includes(stored)) setLangState(stored);

    if (isAuthenticated()) {
      settingsRequest("/settings")
        .then((res) => {
          const l = res?.data?.language as Lang | undefined;
          if (l && VALID.includes(l)) {
            setLangState(l);
            localStorage.setItem("app_lang", l);
          }
        })
        .catch(() => {});
    }
  }, []);

  function setLang(l: Lang) {
    setLangState(l);
    localStorage.setItem("app_lang", l);
  }

  return (
    <LanguageContext.Provider value={{ lang, setLang, t: (key) => translate(lang, key) }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
