// What the app's own screens say (loading, offline, server trouble, crash),
// in the website's five languages and with its colours, so they look like
// the website and not like a different program. The language and light/dark
// are the ones last used on the website (remembered by main.js); before the
// first visit, Windows' own.

const LANGS = ["en", "rw", "fr", "sw", "zh"];

const TEXT = {
  en: {
    loading: "Opening Higoverse…",
    private: "Your business records are private and secure",
    slow: "Still connecting. Your internet seems slow.",
    offline_title: "Can't reach Higoverse",
    offline_body: "Check your internet connection. Higoverse opens again as soon as you're back online.",
    server_title: "Higoverse is restarting",
    server_body: "The server is busy for a moment, often during an update. It opens again by itself.",
    slow_title: "Higoverse is taking too long",
    slow_body: "The connection is very slow or keeps dropping. It keeps trying.",
    crash_title: "Higoverse stopped working",
    crash_body: "The page closed unexpectedly. Reload to carry on where you were.",
    retry: "Try again",
    reload: "Reload",
    auto: "Trying again automatically…",
    hung_title: "Higoverse isn't responding",
    hung_body: "The page is busy. You can wait for it or reload it.",
    wait: "Wait",
  },
  rw: {
    loading: "Higoverse irafunguka…",
    private: "Amakuru y'ubucuruzi bwawe arabitswe neza kandi ni ibanga",
    slow: "Biracyahuza. Interineti yawe isa n'itinda.",
    offline_title: "Ntibishoboye kugera kuri Higoverse",
    offline_body: "Reba interineti yawe. Higoverse irongera ifunguke ukimara kubona interineti.",
    server_title: "Higoverse irimo kongera gutangira",
    server_body: "Seriveri ihuze akanya gato, akenshi mu gihe cyo kuvugurura. Irongera ifunguke yonyine.",
    slow_title: "Higoverse iratinze cyane",
    slow_body: "Interineti iratinda cyane cyangwa igenda icika. Irakomeza kugerageza.",
    crash_title: "Higoverse yahagaze",
    crash_body: "Urupapuro rwafunze bitunguranye. Ongera urufungure ukomeze aho wari ugeze.",
    retry: "Ongera ugerageze",
    reload: "Ongera ufungure",
    auto: "Irongera igerageze yonyine…",
    hung_title: "Higoverse ntisubiza",
    hung_body: "Urupapuro ruhuze. Ushobora gutegereza cyangwa kongera kurufungura.",
    wait: "Tegereza",
  },
  fr: {
    loading: "Ouverture de Higoverse…",
    private: "Les données de votre entreprise sont privées et sécurisées",
    slow: "Connexion en cours. Votre internet semble lent.",
    offline_title: "Impossible de joindre Higoverse",
    offline_body: "Vérifiez votre connexion internet. Higoverse s'ouvrira dès que vous serez reconnecté.",
    server_title: "Higoverse redémarre",
    server_body: "Le serveur est occupé un instant, souvent pendant une mise à jour. Il se rouvre tout seul.",
    slow_title: "Higoverse met trop de temps",
    slow_body: "La connexion est très lente ou se coupe. Nouvel essai en cours.",
    crash_title: "Higoverse a cessé de fonctionner",
    crash_body: "La page s'est fermée de façon inattendue. Rechargez pour reprendre où vous étiez.",
    retry: "Réessayer",
    reload: "Recharger",
    auto: "Nouvel essai automatique…",
    hung_title: "Higoverse ne répond pas",
    hung_body: "La page est occupée. Vous pouvez attendre ou la recharger.",
    wait: "Attendre",
  },
  sw: {
    loading: "Inafungua Higoverse…",
    private: "Taarifa za biashara yako ni za siri na salama",
    slow: "Bado inaunganisha. Intaneti yako inaonekana kuwa ya polepole.",
    offline_title: "Haiwezi kufikia Higoverse",
    offline_body: "Angalia muunganisho wako wa intaneti. Higoverse itafunguka tena mara utakapounganishwa.",
    server_title: "Higoverse inaanza upya",
    server_body: "Seva iko na shughuli kwa muda mfupi, mara nyingi wakati wa sasisho. Itafunguka yenyewe.",
    slow_title: "Higoverse inachukua muda mrefu",
    slow_body: "Muunganisho ni wa polepole sana au unakatika. Inaendelea kujaribu.",
    crash_title: "Higoverse imeacha kufanya kazi",
    crash_body: "Ukurasa ulifungwa ghafla. Pakia upya ili uendelee ulipokuwa.",
    retry: "Jaribu tena",
    reload: "Pakia upya",
    auto: "Inajaribu tena yenyewe…",
    hung_title: "Higoverse haijibu",
    hung_body: "Ukurasa una shughuli. Unaweza kusubiri au kuupakia upya.",
    wait: "Subiri",
  },
  zh: {
    loading: "正在打开 Higoverse…",
    private: "您的业务数据私密且安全",
    slow: "仍在连接，网络似乎较慢。",
    offline_title: "无法连接 Higoverse",
    offline_body: "请检查网络连接。恢复联网后 Higoverse 会自动打开。",
    server_title: "Higoverse 正在重启",
    server_body: "服务器暂时繁忙，通常是在更新。稍后会自动打开。",
    slow_title: "Higoverse 加载时间过长",
    slow_body: "网络很慢或不断中断，正在继续尝试。",
    crash_title: "Higoverse 已停止工作",
    crash_body: "页面意外关闭。重新加载即可从刚才的位置继续。",
    retry: "重试",
    reload: "重新加载",
    auto: "正在自动重试…",
    hung_title: "Higoverse 没有响应",
    hung_body: "页面正忙。您可以等待或重新加载。",
    wait: "等待",
  },
};

/** The website's colours (apps/web/app/globals.css), light and dark. */
const COLORS = {
  light: { paper: "#f4f2ee", surface: "#ffffff", dim: "#ebe9e5", deep: "#e0dfdc", border: "#e0dfdc", text: "#191919", muted: "#474747", ink: "#0a66c2", button: "#0a66c2" },
  dark: { paper: "#000000", surface: "#000000", dim: "#121212", deep: "#262626", border: "#262626", text: "#f5f5f5", muted: "#a8a8a8", ink: "#4a9eed", button: "#0a66c2" },
};

/** A supported language from a saved choice or the system's list ("fr-FR" → "fr"). */
function pickLang(saved, systemLangs = []) {
  for (const l of [saved, ...systemLangs]) {
    const code = String(l || "").toLowerCase().split(/[-_]/)[0];
    if (LANGS.includes(code)) return code;
  }
  return "en";
}

function text(lang) { return TEXT[LANGS.includes(lang) ? lang : "en"]; }

module.exports = { LANGS, TEXT, COLORS, pickLang, text };
