import { translate } from "@/lib/i18n";

/** The home page's questions (i18n keys home.faq<n>_q / _a). */
export const FAQ_COUNT = 6;

/** In English, for structured data: the same words the page shows. */
export const HOME_FAQ = Array.from({ length: FAQ_COUNT }, (_, i) => ({
  q: translate("en", `home.faq${i + 1}_q`),
  a: translate("en", `home.faq${i + 1}_a`),
}));
