"""
Higoverse AI Business Advisor — Rwanda's Smartest Shop Assistant
Standalone engine: intent detection + full real-time shop data + multilingual responses.
Languages: English (en) · Kinyarwanda (rw) · French (fr) · Swahili (sw)
"""
from __future__ import annotations
import random
import time
from datetime import datetime, timezone
from typing import Any

# ── Intent keywords ──────────────────────────────────────────────────────────

_INTENTS = {
    "greeting": [
        "hi", "hello", "hey", "good morning", "good afternoon", "good evening",
        "what's up", "sup", "howdy",
        "muraho", "mwaramutse", "mwiriwe", "bite", "amakuru", "neza", "yego",
        "bonjour", "bonsoir", "salut", "coucou",
        "habari", "jambo", "hujambo", "karibu", "salam",
    ],
    "thanks": [
        "thank", "thanks", "thank you", "appreciate", "awesome", "perfect",
        "helpful", "nice", "good job", "well done", "amazing", "excellent",
        "murakoze", "urakoze", "ni byiza", "ni nziza", "waramutse",
        "merci", "super", "parfait", "c'est bien",
        "asante", "nashukuru", "vizuri sana", "nzuri",
    ],
    "help": [
        "help", "what can you", "what do you", "capabilities", "what are you",
        "who are you", "tell me about yourself", "your name", "how do you work",
        "nshobora", "ubufasha", "urikora iki", "uri nde",
        "aide", "que peux-tu", "qui es-tu",
        "msaada", "unaweza", "wewe ni nani",
    ],
    "emotion_stress": [
        "stress", "stressed", "tired", "exhausted", "overwhelm", "overwhelmed",
        "anxious", "worried", "worry", "scared", "nervous", "struggling",
        "hard time", "difficult", "tough", "rough", "frustrated", "giving up",
        "losing hope", "hopeless", "burned out", "depressed", "bad day",
        "nshakaye", "birangoye", "umunaniro", "ndananiwe", "biragoye",
        "stressé", "fatigué", "épuisé", "inquiet", "difficile", "découragé",
        "nimechoka", "wasiwasi", "nimeshuka", "ngumu", "shida",
    ],
    "emotion_happy": [
        "happy", "excited", "great day", "amazing", "wonderful", "fantastic",
        "good news", "celebrating", "made a sale", "big sale", "proud",
        "success", "won", "milestone", "achievement", "nailed it",
        "numereye neza", "nezerwa", "nishimiye", "inkuru nziza",
        "heureux", "content", "bonne nouvelle", "réussite", "succès",
        "furaha", "nimefurahi", "habari njema", "mafanikio",
    ],
    "smalltalk": [
        "how are you", "how do you do", "how's it going", "you okay",
        "are you real", "do you feel", "are you human", "are you alive",
        "can you think", "what do you think", "tell me something",
        "talk to me", "i'm bored", "just chatting", "what's new",
        "what time", "what day", "what's today", "let's talk",
        "urakora ite", "uriho", "comment tu vas", "uko vipi",
    ],
    "joke": [
        "joke", "funny", "make me laugh", "tell me a joke", "humor",
        "something funny", "cheer me up", "laugh", "haha",
        "blague", "fais moi rire", "utani", "nichekesha",
    ],
    "motivation": [
        "motivat", "inspire", "encourage", "keep going", "don't give up",
        "i need energy", "give me strength", "push me", "cheer me",
        "shishikariza", "umpe imbaraga", "encourager", "motiver",
        "nipa nguvu", "nishike", "niambie",
    ],
    "advice": [
        "what should i do", "i need advice", "help me decide", "should i",
        "is it good idea", "what would you do", "not sure", "confused",
        "lost", "don't know what", "suggest", "recommend",
        "nkire inama", "nagomba inama", "nkore iki",
        "que faire", "conseil", "nifanye nini", "nisaidie",
    ],
    "performance": [
        "performance", "how is", "how am i", "doing today", "summary",
        "overview", "status", "business today", "shop today", "situation",
        "check", "update", "today", "this week", "this month",
        "imiterere", "uko bigenze", "incamake", "uyu munsi",
        "comment va", "résumé", "bilan", "aujourd'hui",
        "utendaji", "muhtasari", "leo",
    ],
    "inventory": [
        "stock", "inventory", "restock", "low", "out of", "product", "item",
        "running out", "empty", "shortage", "refill", "quantity", "warehouse",
        "how many", "products list", "what do i have", "ibicuruzwa",
        "ububiko", "birangiye", "bikenewe", "kuzuza",
        "inventaire", "réapprovisionner", "rupture", "articles",
        "akiba", "bidhaa", "imalizika", "kujaza", "stoo",
    ],
    "financial": [
        "revenue", "profit", "expense", "cost", "money", "income", "loss",
        "earning", "spending", "financial", "finance", "cash", "budget",
        "how much", "margin", "net profit", "gross",
        "amafaranga", "inyungu", "igiciro", "umusaruro", "ibyaguriye",
        "revenu", "dépense", "coût", "argent", "bénéfice", "perte",
        "mapato", "faida", "gharama", "pesa", "hasara", "fedha",
    ],
    "sales": [
        "sale", "sales", "transaction", "sold", "customer", "order",
        "recent", "today sale", "sell", "buyers", "last sale",
        "amagurishwa", "igurisha", "abakiriya",
        "vente", "ventes", "vendu", "client", "commande",
        "mauzo", "uuzaji", "muamala", "wateja",
    ],
    "growth": [
        "grow", "growth", "improve", "best product", "top product",
        "opportunity", "increase", "focus", "strategy", "expand",
        "tip", "tips", "how to improve", "next level",
        "gutera imbere", "ibicuruzwa byiza", "inama", "ingenzi",
        "croissance", "meilleur produit", "améliorer", "opportunité",
        "ukuaji", "bidhaa bora", "kuboresha", "fursa", "ushauri",
    ],
    "purchases": [
        "purchase", "bought", "supplier", "buying", "reorder", "procurement",
        "vendor", "buy", "order stock", "supply",
        "ibigurwa", "abaganishi", "kugura",
        "achat", "fournisseur", "approvisionnement",
        "manunuzi", "wasambazaji", "kununua",
    ],
    "expenses_detail": [
        "expense", "expenses", "spending", "what did i spend",
        "cost this month", "biggest expense", "where is my money going",
        "ibyaguriyemo", "amafaranga yaguriyemo",
        "dépenses", "où va mon argent",
        "gharama zangu", "ninatumia wapi pesa",
    ],
    "suppliers": [
        "supplier", "suppliers", "vendor", "vendors", "partner", "partners",
        "who do i buy from", "my suppliers", "abaganishi banjye",
        "fournisseur", "mes fournisseurs", "wasambazaji wangu",
    ],
    "comparison": [
        "compare", "vs", "versus", "difference", "last week", "last month",
        "better", "worse", "trend", "change", "growth rate",
        "ugereranye", "ubuhinduzi", "tendance",
        "linganisha", "mwelekeo",
    ],
    "prediction": [
        "predict", "forecast", "next month", "next week", "will i",
        "how will", "estimate", "project", "future",
        "hazaza", "hazaza hafi", "prévoir", "prévision",
        "utabiri", "baadaye",
    ],
    "report": [
        "report", "full report", "complete", "everything", "all data",
        "detailed", "generate report", "monthly report", "weekly report",
        "raporo", "raporo yose", "byose",
        "rapport", "rapport complet", "tout",
        "ripoti", "ripoti kamili", "kila kitu",
    ],
}

# ── Helpers ──────────────────────────────────────────────────────────────────

def _fmt(amount: Any) -> str:
    try:
        v = float(amount)
        return f"{v:,.0f} RWF"
    except Exception:
        return "—"

def _pct(current: float, previous: float) -> str:
    if previous == 0:
        return "📊 new data"
    p = ((current - previous) / previous) * 100
    return f"{'📈' if p >= 0 else '📉'} {abs(p):.1f}% {'up' if p >= 0 else 'down'}"

def _shop(ctx: dict) -> str:
    return ctx.get("shop", {}).get("name", "your shop")

def _stats(ctx: dict) -> dict:
    return ctx.get("sales", {}).get("stats", {})

def _rnd_greeting(lang: str) -> str:
    en = ["Hey there! 👋", "Great to hear from you! 😊", "Hello! 👋", "Hi! Good to see you! 😄"]
    rw = ["Muraho cyane! 👋", "Bite se! Nishimiye kukubona! 😊", "Muraho! Amakuru? 👋", "Bite! 😄"]
    fr = ["Bonjour! 👋", "Salut! Content de vous voir! 😊", "Bonjour à vous! 👋", "Salut! 😄"]
    sw = ["Habari! 👋", "Karibu sana! 😊", "Hujambo! 👋", "Jambo! 😄"]
    pool = {"rw": rw, "fr": fr, "sw": sw}.get(lang, en)
    return random.choice(pool)

def _detect_intent(message: str) -> str:
    lower = message.lower()
    scores: dict[str, int] = {k: 0 for k in _INTENTS}
    for intent, kws in _INTENTS.items():
        for kw in kws:
            if kw in lower:
                scores[intent] += 1
    best = max(scores, key=lambda k: scores[k])
    return best if scores[best] > 0 else "performance"


# ── GREETING ────────────────────────────────────────────────────────────────

def _build_greeting(ctx: dict, lang: str) -> str:
    name = _shop(ctx)
    s    = _stats(ctx)
    rev  = float(s.get("revenue_today", 0))
    sales = int(s.get("sales_today", 0))
    hour = ctx.get("hour_utc", 12)
    greeting = _rnd_greeting(lang)

    time_rw = "Mwaramutse" if hour < 10 else "Mwiriwe" if hour >= 16 else "Muraho"

    if lang == "rw":
        snapshot = f"Uyu munsi, {name} yakoze amafaranga {_fmt(rev)} mu gurishwa {sales} bya ngombwa." if rev > 0 else f"Turasubiramo amakuru ya {name} hamwe."
        return f"""{time_rw}! 👋 Ikaze kuri Higoverse AI Advisor — Umujyanama wawe w'Ubucuruzi!

{snapshot}

Ndi hano kukugezaho inama zihamye zifatiye ku makuru y'ukuri ya {name}. Birashoboka!

Dore ibintu nshobora kukora:

📊 Imiterere y'iduka — Imari, amagurishwa, n'ububiko byose
📦 Ububiko — Ni ibicuruzwa bihe bikenewe kuzuzwa cyangwa birangiye?
💰 Imari — Amafaranga yinjiye, yaguriyemo, n'inyungu nyayo
🛒 Amagurishwa — Isesengura ry'amagurishwa y'uyu munsi no mu cyumweru
📈 Gutera imbere — Inama zo kongera ubucuruzi wawe
🚚 Ibigurwa — Abaganishi n'ibigurwa byagurijwe
📋 Raporo yuzuye — Isesengura ryose ry'ubucuruzi

💬 Baza ikibazo cyose mu Kinyarwanda, Icyongereza, Igifaransa, cyangwa Kiswahili!

Mbwira — nzakugezaho ibisubizo bihagije! 🚀"""

    if lang == "fr":
        snapshot = f"Aujourd'hui, {name} a réalisé {_fmt(rev)} avec {sales} vente(s)." if rev > 0 else f"Je suis prêt à analyser {name} avec vous."
        return f"""Bonjour! 👋 Bienvenue sur Higoverse AI Advisor — Votre Assistant Commercial Intelligent!

{snapshot}

Je suis ici pour vous donner des conseils basés sur les vraies données de {name}.

Voici ce que je peux faire:

📊 Performance globale — Finances, ventes et stocks en un coup d'œil
📦 Inventaire — Articles en rupture ou à faible stock
💰 Finances — Revenus, dépenses et bénéfice net
🛒 Ventes — Analyse des transactions du jour et de la semaine
📈 Croissance — Opportunités et stratégies pour développer votre business
🚚 Achats — Suivi des fournisseurs et approvisionnements
📋 Rapport complet — Tout en détail

💬 Je parle Français, Anglais, Kinyarwanda et Swahili — à vous de choisir!

Qu'est-ce qui vous préoccupe aujourd'hui? Je suis là! 🚀"""

    if lang == "sw":
        snapshot = f"Leo, {name} imefanya {_fmt(rev)} kwa mauzo {sales}." if rev > 0 else f"Niko tayari kuchambua {name} nawe."
        return f"""Habari! 👋 Karibu kwa Higoverse AI Advisor — Mshauri Wako wa Biashara!

{snapshot}

Niko hapa kukupa ushauri unaotegemea data halisi ya {name}.

Hivi ndivyo ninavyoweza kukusaidia:

📊 Utendaji — Fedha, mauzo na akiba kwa pamoja
📦 Akiba — Bidhaa zipi zinahitaji kujazwa au zimeisha?
💰 Fedha — Mapato, gharama na faida halisi
🛒 Mauzo — Uchambuzi wa miamala ya leo na wiki
📈 Ukuaji — Fursa na mikakati ya kukuza biashara
🚚 Manunuzi — Ufuatiliaji wa wasambazaji
📋 Ripoti kamili — Kila kitu kwa undani

💬 Ninazungumza Kiswahili, Kiingereza, Kifaransa na Kinyarwanda!

Niambie — nitakusaidia kupata majibu mazuri! 🚀"""

    snapshot = f"By the way, {name} has made {_fmt(rev)} from {sales} sale(s) so far today!" if rev > 0 else f"I'm ready to analyze {name} with you."
    return f"""{greeting} Welcome to Higoverse AI Advisor — Rwanda's Smartest Business Assistant!

{snapshot}

I have real-time access to everything happening in your shop and I'm here to help you make smarter decisions every day.

Here's what I can do for you:

📊 Business performance — Finances, sales & stock all in one place
📦 Inventory intelligence — Know exactly what needs restocking and what's selling
💰 Financial clarity — Revenue, expenses, profit margins & trends
🛒 Sales analysis — Today's, this week's, and monthly breakdown
📈 Growth strategy — Actionable tips to grow your revenue in Rwanda's market
🚚 Purchases & suppliers — Track what you buy and from whom
📋 Full business report — Comprehensive analysis on demand
💬 Human chat — I'm also here to talk, listen and motivate you!

I speak English, Kinyarwanda, French & Swahili — your choice!

So, what would you like to explore today? I'm all yours! 🚀"""


# ── THANKS ──────────────────────────────────────────────────────────────────

def _build_thanks(ctx: dict, lang: str) -> str:
    name = _shop(ctx)
    msgs_rw = [
        f"Nta kibazo! Ni ubukungu kugufasha! 😊\n\nEse hari ikindi kintu ushaka kumenya ku bijyanye na {name}? Nzasubiza vuba!",
        f"Ni agakundo! Nishimye ko nabashije gufasha! 🎉\n\nUshaka gukomeza isesengura ry'ubucuruzi bwawe?",
        f"Urakoze! Ntugire ubwoba bwo kubaza igihe cyose. {name} ni iduka ryawe — tubikorere hamwe! 💪",
    ]
    msgs_fr = [
        f"De rien! C'est un plaisir! 😊\n\nY a-t-il autre chose sur {name} que vous aimeriez explorer?",
        f"Avec plaisir! 🎉 Je suis là pour vous aider à prendre les meilleures décisions pour votre commerce.",
        f"Merci à vous! N'hésitez jamais à poser des questions — chaque question vous rapproche du succès! 💪",
    ]
    msgs_sw = [
        f"Karibu sana! 😊 Je, kuna kingine unachotaka kujua kuhusu {name}?",
        f"Asante! 🎉 Niko hapa wakati wowote unahitaji msaada.",
        f"Furaha kusaidia! Usiogope kuuliza chochote — hii ndiyo sababu nipo! 💪",
    ]
    msgs_en = [
        f"You're so welcome! 😊 Always happy to help {name} grow stronger.\n\nAnything else you'd like to explore?",
        f"Glad I could help! 🎉 Remember — every question you ask makes your business smarter. Keep going!",
        f"Absolutely! That's what I'm here for! 💪\n\nDon't hesitate to ask me anything — I've got all your shop data ready!",
    ]
    pool = {"rw": msgs_rw, "fr": msgs_fr, "sw": msgs_sw}.get(lang, msgs_en)
    return random.choice(pool)


# ── HELP ────────────────────────────────────────────────────────────────────

def _build_help(ctx: dict, lang: str) -> str:
    name     = _shop(ctx)
    inv      = ctx.get("inventory", {})
    total_p  = inv.get("total_products", 0)
    suppliers= ctx.get("partners", {}).get("total_suppliers", 0)
    s        = _stats(ctx)
    rev_m    = _fmt(s.get("revenue_month", 0))

    if lang == "rw":
        return f"""Ndi Higoverse AI Advisor! 🤖✨

Ndi umufasha w'ubucuruzi wubakiwe mu Rwanda, kugira ngo ngufashe gukuza {name}.

Ubu nkuzi ibyo:
• 📦 {total_p} ibicuruzwa muri ububiko bwawe
• 🤝 Abaganishi {suppliers}
• 💰 Amafaranga yinjiye uku kwezi: {rev_m}

🧠 IBINTU NSHOBORA GUKORA:

📊 Imiterere y'iduka — Isesengura ryuzuye ry'amagurishwa, imari, n'ububiko
📦 Ububiko — Reba ibicuruzwa byose, bikenewe kuzuzwa, cyangwa birangiye
💰 Imari — Isesengura ry'amafaranga yinjiye, yaguriyemo, n'inyungu nyayo
🛒 Amagurishwa — Amagurishwa y'uyu munsi, icyumweru, cyangwa ukwezi
📈 Gutera imbere — Inama n'amahirwe yo kongera ubucuruzi wawe mu Rwanda
🚚 Ibigurwa — Abaganishi bawe n'ibigurwa byagurijwe vuba
📋 Raporo — Raporo yuzuye n'isesengura ryimbitse ry'ubucuruzi
💬 Kuganira — Nagira nawe, nkwumve, nkuhe inkunga

🇷🇼 IMPAMVU NKWITONDERWA MU RWANDA:
Nzi imari mu RWF. Nshobora kukugezaho inama zijyanye n'imicungire y'amafaranga, uburyo bw'amagurishwa mu Rwanda, n'inzira zo kugera ku bakiriya benshi.

Wandike ikibazo cyose — nzasubiza neza! 😊"""

    if lang == "fr":
        return f"""Je suis Higoverse AI Advisor! 🤖✨

Je suis votre conseiller commercial intelligent, conçu pour aider les entrepreneurs rwandais à développer leur business comme {name}.

Ce que je sais de vous en ce moment:
• 📦 {total_p} produits dans votre inventaire
• 🤝 {suppliers} fournisseurs enregistrés
• 💰 Revenu mensuel: {rev_m}

🧠 MES CAPACITÉS COMPLÈTES:

📊 Performance — Analyse complète des ventes, finances et stocks
📦 Inventaire — Voir tous les produits, ceux en rupture, ceux à commander
💰 Finances — Revenus, dépenses, profit net, marge bénéficiaire
🛒 Ventes — Aujourd'hui, cette semaine, ce mois — tout en détail
📈 Croissance — Stratégies et opportunités pour le marché rwandais
🚚 Achats — Vos fournisseurs et historique d'approvisionnement
📋 Rapports — Analyse complète sur demande
💬 Discussion — Je suis aussi là pour écouter et motiver!

🇷🇼 ADAPTÉ AU RWANDA:
Je travaille en RWF, je comprends le contexte économique rwandais et je peux vous conseiller sur des stratégies adaptées au marché local.

N'hésitez pas à tout me demander! 😊"""

    if lang == "sw":
        return f"""Mimi ni Higoverse AI Advisor! 🤖✨

Mimi ni mshauri wako wa biashara, niliyoundwa kusaidia wafanyabiashara Rwanda kukuza biashara kama {name}.

Ninachojua kuhusu wewe sasa hivi:
• 📦 Bidhaa {total_p} katika akiba yako
• 🤝 Wasambazaji {suppliers} waliorekodiwa
• 💰 Mapato ya mwezi: {rev_m}

🧠 UWEZO WANGU WOTE:

📊 Utendaji — Uchambuzi kamili wa mauzo, fedha na akiba
📦 Akiba — Bidhaa zote, zinazokwisha, na zinahitaji kuagizwa
💰 Fedha — Mapato, gharama, faida halisi, asilimia ya faida
🛒 Mauzo — Leo, wiki hii, mwezi huu — kwa undani
📈 Ukuaji — Mikakati na fursa kwa soko la Rwanda
🚚 Manunuzi — Wasambazaji wako na historia ya ununuzi
📋 Ripoti — Uchambuzi kamili unapoombwa
💬 Mazungumzo — Niko hapa pia kukusikiliza na kukutia moyo!

🇷🇼 IMEBADILISHWA KWA RWANDA:
Ninafanya kazi kwa RWF, naelewa mazingira ya kiuchumi ya Rwanda.

Niulize chochote! 😊"""

    return f"""I'm Higoverse AI Advisor! 🤖✨

I'm Rwanda's most intelligent shop companion, built to help business owners like you grow {name} smarter and faster.

Here's what I already know about your shop:
• 📦 {total_p} products in your inventory
• 🤝 {suppliers} registered suppliers
• 💰 Revenue this month: {rev_m}

🧠 MY FULL CAPABILITIES:

📊 Business performance — Real-time analysis of sales, finances & inventory together
📦 Inventory intelligence — Full product list, low stock alerts, restock recommendations
💰 Financial clarity — Revenue, expenses, net profit, margins & trends
🛒 Sales breakdown — Today, this week, this month — every transaction matters
📈 Growth strategy — Rwanda-specific tips to grow revenue and customer base
🚚 Purchases & suppliers — Track what you buy, from whom, and how much
📋 Full business report — Comprehensive analysis whenever you need it
💬 Human conversation — Talk to me, share your worries, I genuinely listen!

🇷🇼 BUILT FOR RWANDA:
I think in RWF, understand Rwanda's business seasons, and give advice tuned to the local market.

What would you like to know? Ask me anything! 😊"""


# ── MOTIVATION ──────────────────────────────────────────────────────────────

def _build_motivation(ctx: dict, lang: str) -> str:
    name = _shop(ctx)
    s    = _stats(ctx)
    rev  = float(s.get("revenue_month", 0))
    quotes_rw = [
        f"\"Ubucuruzi bwiza ntibubuka vuba, ariko bukomera buri munsi.\" 💪\n\n{name} yakoze {_fmt(rev)} uku kwezi. Ibi ni ibimenyetso by'iterambere!",
        "\"Ukwezi gushize wari aho uri uyu munsi.\" Komeza gutera imbere — buri gurishwa ni intambwe! 🚀",
        "\"Inzira y'imyaka igihumbi itangira intambwe imwe.\" Ukomeze! 💫",
        "Mu Rwanda, abantu benshi batangiye ubucuruzi buto ariko ubu bafite amateka manini. Ukomeze — nawe uzagera! 🇷🇼",
    ]
    quotes_fr = [
        f"\"Le succès n'est pas final, l'échec n'est pas fatal — c'est le courage de continuer qui compte.\" 💪\n\n{name} a fait {_fmt(rev)} ce mois. Continuez!",
        "\"Chaque vente est un pas vers votre succès.\" Ne lâchez pas! 🚀",
        "\"Les grands business ont tous commencé petit.\" Votre journey est en bonne voie! 💫",
        f"Au Rwanda, des milliers d'entrepreneurs ont transformé de petites boutiques en grandes entreprises. Vous êtes sur la bonne voie! 🇷🇼",
    ]
    quotes_sw = [
        f"\"Mafanikio si mwisho, kushindwa si mauti — ujasiri wa kuendelea ndio muhimu.\" 💪\n\n{name} imefanya {_fmt(rev)} mwezi huu. Endelea!",
        "\"Kila uuzaji ni hatua moja kuelekea mafanikio yako.\" Usijisahau! 🚀",
        "\"Biashara kubwa zote zilianza ndogo.\" Safari yako inakwenda vizuri! 💫",
        f"Huko Rwanda, wafanyabiashara wengi wamegeuza maduka madogo kuwa makubwa. Uko njiani! 🇷🇼",
    ]
    quotes_en = [
        f"\"Success is not built overnight — it's built every single day.\" 💪\n\n{name} has already made {_fmt(rev)} this month. That's real progress!",
        "\"Every sale you make is proof that your business is working. Keep going!\" 🚀\n\nThe best entrepreneurs in Rwanda started exactly where you are.",
        "\"A great business is just a collection of small good decisions.\" You're making them every day! 💫",
        f"In Rwanda's growing economy, shops like {name} are the backbone of the country. What you're building matters! 🇷🇼",
        "\"Iterambere\" — development — is in your hands. Every day you open your shop, you're contributing to Rwanda's vision. Keep going! 💪",
    ]
    pool  = {"rw": quotes_rw, "fr": quotes_fr, "sw": quotes_sw}.get(lang, quotes_en)
    quote = random.choice(pool)

    follows = {
        "en": f"\n\nWant me to show you what's going well in {name} right now? Sometimes seeing the numbers lifts the spirit! 📊",
        "rw": f"\n\nUshaka ko nsesengura uko {name} igenda ubu? Amakuru meza ashobora gutanga imbaraga! 📊",
        "fr": f"\n\nVoulez-vous que je vous montre ce qui va bien dans {name} en ce moment? Parfois les chiffres remontent le moral! 📊",
        "sw": f"\n\nUnataka nione jinsi {name} inavyofanya sasa hivi? Mara nyingi nambari njema zinatia moyo! 📊",
    }
    return quote + follows.get(lang, follows["en"])


# ── STRESS / EMPATHY ────────────────────────────────────────────────────────

def _build_stress(ctx: dict, lang: str) -> str:
    name  = _shop(ctx)
    s     = _stats(ctx)
    rev   = float(s.get("revenue_today", 0))
    sales = int(s.get("sales_today", 0))
    low   = len(ctx.get("inventory", {}).get("low_stock_items", []))

    good_news = ""
    if rev > 0:
        good_news = {
            "en": f"\n\n📊 Here's something real: {name} made {_fmt(rev)} from {sales} sale(s) today. That's not nothing — that's you showing up and making it happen!",
            "rw": f"\n\n📊 Ibintu by'ukuri: {name} yakoze {_fmt(rev)} mu gurishwa {sales} uyu munsi. Ibi ni igikorwa cyawe!",
            "fr": f"\n\n📊 Un fait réel: {name} a fait {_fmt(rev)} avec {sales} vente(s) aujourd'hui. C'est votre travail qui porte ses fruits!",
            "sw": f"\n\n📊 Ukweli: {name} imefanya {_fmt(rev)} kwa mauzo {sales} leo. Hiyo ni kazi yako inayozaa matunda!",
        }.get(lang, "")

    if lang == "rw":
        return f"""Numva bimeze neza kubaza. Nkugize inkunga! 🤝

Ubucuruzi bugeza abantu benshi mu bihe bikomeye — haba i Kigali, Musanze, Huye, cyangwa hose mu Rwanda. Si wowe gusa.{good_news}

Impamvu nyinshi z'umunaniro w'abacuruzi:
• Amagurishwa agenda nabi udashakashaka
• Amafaranga yaguriyemo yiyongera vuba
• Ububiko burimo ingorane
• Gutwara umutwe byinshi mu gihe kimwe

💡 Ibintu 3 bishobora gufasha nonaha:

1️⃣ Reba amakuru y'ukuri — Reba imiterere ya {name} ubu, hanyuma dufatanye ibyemezo bihamye, si ubwoba
2️⃣ Icyo kintu kimwe — Hitamo ingorane imwe ikomeye maze tuyisubiremo gusa
3️⃣ Kubahiriza ibyo wageze — {"Ububiko bwasigaye bwagabanutse ariko " + str(low) + " ibicuruzwa birashobora gufasha" if low > 0 else "Ububiko bwose buri mwanya — ibi ni byiza!"}

Mbwira icyo gikorwa gikugorana cyane ubu — tubikorere hamwe! 💪🇷🇼"""

    if lang == "fr":
        return f"""Je comprends, et c'est tout à fait normal. Je suis là pour vous! 🤝

Gérer un commerce au Rwanda — à Kigali, Butare, Gisenyi ou ailleurs — peut être épuisant. Vous n'êtes pas seul(e).{good_news}

Les causes fréquentes de stress chez les commerçants rwandais:
• Ventes instables sans raison apparente
• Coûts qui montent plus vite que les revenus
• Problèmes de stock et de fournisseurs
• Trop de choses à gérer en même temps

💡 3 choses qui peuvent aider maintenant:

1️⃣ Regarder les vrais chiffres — Voyons ensemble l'état de {name} aujourd'hui
2️⃣ Une priorité à la fois — Identifiez le problème #1 et attaquons-le ensemble
3️⃣ Comptez vos progrès — {"Il y a " + str(low) + " articles à surveiller, mais votre stock principal tient bon!" if low > 0 else "Vos stocks sont sains — c'est une bonne base!"}

Dites-moi ce qui vous pèse le plus — on règle ça ensemble! 💪🇷🇼"""

    if lang == "sw":
        return f"""Naelewa, na ni hali ya kawaida. Niko hapa nawe! 🤝

Kuendesha biashara Rwanda — Kigali, Muhanga, Rubavu au sehemu nyingine — kunaweza kuchoshea. Huwezi kuwa peke yako.{good_news}

Sababu za kawaida za msongo kwa wafanyabiashara:
• Mauzo yanayoshuka bila sababu
• Gharama zinazoongezeka haraka
• Matatizo ya akiba na wasambazaji
• Mambo mengi sana kwa wakati mmoja

💡 Mambo 3 yanayoweza kusaidia sasa:

1️⃣ Tazama nambari halisi — Tuchunguze hali ya {name} leo pamoja
2️⃣ Kitu kimoja kwa wakati — Taitambue tatizo kuu moja tulishughulikie
3️⃣ Tambua mafanikio yako — {"Bidhaa " + str(low) + " zinahitaji uangalifu lakini msingi wako ni mzuri!" if low > 0 else "Akiba yako iko sawa — ni msingi mzuri!"}

Niambie kinachokusumbua zaidi — tutashughulikia pamoja! 💪🇷🇼"""

    return f"""Hey, I hear you — and it's completely okay to feel this way. I'm here! 🤝

Running a business in Rwanda — in Kigali, Butare, Gisenyi, or anywhere — is genuinely hard work. You are not alone in this.{good_news}

Common reasons business owners feel overwhelmed:
• Sales fluctuating without clear reason
• Costs rising faster than revenue
• Stock and supplier headaches
• Too many decisions to make at once

💡 Three things that usually help right now:

1️⃣ See the real numbers — Let me pull up what's actually happening at {name} today, so we work from facts, not fear
2️⃣ One thing at a time — Tell me the #1 problem and we'll tackle just that
3️⃣ Count your wins — {"You have " + str(low) + " items to watch but your core business is still running!" if low > 0 else "Your stock levels are healthy — that's a great foundation!"}

What's weighing on you most right now? Tell me — we'll figure it out together! 💪🇷🇼"""


# ── HAPPY ───────────────────────────────────────────────────────────────────

def _build_happy(ctx: dict, lang: str) -> str:
    name = _shop(ctx)
    s    = _stats(ctx)
    rev  = float(s.get("revenue_today", 0))

    if lang == "rw":
        return f"""Wooow! Nishimiye cyane kumva inkuru nziza! 🎉🎊

Ibikorwa byiza bikwiye gushimiwa! Wihe agaciro gakwiye!

{f"Uyu munsi, {name} yakoze {_fmt(rev)} — ibintu birenda neza!" if rev > 0 else ""}

Ukomeze ukomeze aho wari — kandi nshobora kukugezaho amakuru kugira ngo ufate muri iyi myanya myiza:

• 📊 Reba imiterere y'iduka uyu munsi
• 📈 Reba amahirwe yo kongera ubucuruzi
• 💰 Suzuma imari yawe ubike inzira yo imbere

Ibyo wagiye ubikorera byatumye ibintu bigenda neza? Mbwira! Nishimiye! 🚀🇷🇼"""

    if lang == "fr":
        return f"""Fantastique! Je suis vraiment heureux de l'entendre! 🎉🎊

Prenez un moment pour célébrer — vous le méritez vraiment!

{f"Aujourd'hui, {name} a fait {_fmt(rev)} — les choses avancent bien!" if rev > 0 else ""}

Profitons de cette énergie positive pour aller encore plus loin:

• 📊 Voir les chiffres du moment
• 📈 Explorer les opportunités de croissance
• 💰 Planifier votre prochaine étape depuis cette position de force

Dites-moi ce qui s'est si bien passé — et voyons comment construire là-dessus! 🚀🇷🇼"""

    if lang == "sw":
        return f"""Wow! Hiyo ni habari nzuri sana! 🎉🎊

Chukua muda kusherehekea — unastahili kweli kweli!

{f"Leo, {name} imefanya {_fmt(rev)} — mambo yanakwenda vizuri!" if rev > 0 else ""}

Hebu tutumie nguvu hii nzuri kwenda mbali zaidi:

• 📊 Angalia nambari za sasa hivi
• 📈 Chunguza fursa za ukuaji
• 💰 Panga hatua yako inayofuata kutoka mahali pa nguvu

Niambie kilichoenda vizuri — tuone jinsi ya kujenga juu yake! 🚀🇷🇼"""

    return f"""Woohoo! That's amazing to hear! 🎉🎊

Take a moment to appreciate that — you genuinely earned it!

{f"Today alone, {name} has made {_fmt(rev)} — things are moving!" if rev > 0 else ""}

Let's channel that winning energy into your next move:

• 📊 Check today's numbers while you're in a great mindset
• 📈 Explore growth opportunities — now is the best time to think big
• 💰 Plan your next investment from a position of strength

Tell me what went well today — and let's see how we build on it! 🚀🇷🇼"""


# ── SMALLTALK ───────────────────────────────────────────────────────────────

def _build_smalltalk(ctx: dict, lang: str, message: str) -> str:
    lower = message.lower()
    name  = _shop(ctx)
    now   = datetime.now(timezone.utc)
    hour  = now.hour
    day   = now.strftime("%A, %B %d")
    period = "morning ☀️" if hour < 12 else "afternoon 🌤️" if hour < 17 else "evening 🌙"

    # How are you
    if any(w in lower for w in ["how are you", "how do you do", "uko vipi", "comment tu vas", "urakora ite", "bite se"]):
        responses = {
            "rw": f"Nkora neza cyane, murakoze! 😊\n\nNdi hano buri gihe, ntaruhuka — kugira ngo ngufe {name} utera imbere.\n\nWowe urakora ite? Ubucuruzi bugenda bite? Baza ikintu cyose! 💬",
            "fr": f"Je vais très bien, merci! 😊\n\nJe suis là 24h/24 pour aider {name} à prospérer. Aujourd'hui c'est {day}.\n\nEt vous? Comment ça se passe au commerce? 💬",
            "sw": f"Niko vizuri sana, asante! 😊\n\nNipo hapa saa 24 kusaidia {name} kukua. Leo ni {day}.\n\nJe wewe uko vipi? Biashara inakwenda vipi? 💬",
            "en": f"I'm doing great, thank you for asking! 😊\n\nI'm here around the clock helping {name} grow stronger. Today is {day}.\n\nHow about you? How's business feeling today? 💬",
        }
        return responses.get(lang, responses["en"])

    # Are you real / AI / human
    if any(w in lower for w in ["are you real", "are you human", "are you alive", "do you feel", "uri nde", "wewe ni nani", "qui es-tu"]):
        responses = {
            "rw": """Mbaza ikibazo cyiza! 🤖\n\nNdi AI — sinumva ibintu nka muntu, ariko nkurangira amakuru y'ukuri ya {name} kandi mpanga ibisubizo bifatiye ku makuru.\n\nIbintu ntakora:\n• Ntagira amarangamutima — ariko nshobora kumva ingorane zawe\n• Simbeshya — nzabuzaza amakuru y'ukuri buri gihe\n\nIbintu nakora neza:\n• 📊 Isesengura ry'amakuru y'iduka ryawe\n• 💡 Inama zihamye zifatiye ku makuru\n• 💬 Ndi hano igihe cyose ushaka\n\nNdi AI, yego — ariko nemera kugufasha kera imbere! 😊""".format(name=name),
            "en": f"""Great question! 🤖\n\nI'm an AI — I don't feel things like you do, but I genuinely have access to {name}'s real data and give you honest, fact-based guidance.\n\nWhat I CAN'T do:\n• Feel emotions (but I understand your challenges)\n• Make up numbers (I always show real data)\n\nWhat I DO really well:\n• 📊 Analyze your actual shop data in real time\n• 💡 Give Rwanda-specific business advice\n• 💬 Be available whenever you need me, no judgment\n\nI'm an AI — but I genuinely care about {name}'s success! 😊""",
        }
        return responses.get(lang, responses["en"])

    # What time / day
    if any(w in lower for w in ["what time", "what day", "what's today", "date", "uyu munsi ni ryari", "quelle heure"]):
        responses = {
            "rw": f"Uyu munsi ni {day}, {hour:02d}:00 UTC. 🕐\n\nWowe uri muri zone ya EAT (UTC+3), bityo ni {(hour+3)%24:02d}:00 i Kigali!\n\n{name} igenda bite uyu {period.split()[0]}? 💬",
            "fr": f"Aujourd'hui c'est {day}, {hour:02d}:00 UTC ({(hour+3)%24:02d}:00 heure de Kigali). 🕐\n\nComment se passe votre {period.split()[0]} chez {name}? 💬",
            "en": f"It's {day}, {hour:02d}:00 UTC — that's {(hour+3)%24:02d}:00 in Kigali! 🕐\n\nHow's your {period} going at {name}? 💬",
        }
        return responses.get(lang, responses["en"])

    # Generic smalltalk
    responses = {
        "rw": f"Nshimishwa kuganira nawe! 😊\n\nNdi inzobere mu bibazo by'ubucuruzi, ariko nawe nzumva kuri ibintu byose. {name} ni iy'ingenzi kuri jye!\n\nEse hari ikindi ushaka kubaza? Nzasubiza vuba! 💬",
        "fr": f"Ravi de discuter avec vous! 😊\n\nJe suis spécialisé dans le conseil commercial, mais je suis là pour tout!\n\n{name} se porte bien aujourd'hui? Posez-moi n'importe quelle question! 💬",
        "sw": f"Ninafurahi kuzungumza nawe! 😊\n\nMimi ni mtaalamu wa biashara, lakini niko hapa kwa kila kitu!\n\n{name} inakwenda vipi leo? Niulize chochote! 💬",
        "en": f"Always love chatting! 😊\n\nI'm at my best with business topics, but I'm here for anything you need.\n\nHow's {name} treating you today? What's on your mind? 💬",
    }
    return responses.get(lang, responses["en"])


# ── JOKE ────────────────────────────────────────────────────────────────────

def _build_joke(ctx: dict, lang: str) -> str:
    name = _shop(ctx)
    jokes = {
        "en": [
            ("Why did the shopkeeper go to art school?", "To improve his \"sale\" technique! 🎨"),
            ("What do you call a business that runs itself?", "A dream! But with Higoverse AI, you get pretty close! 😄"),
            ("Why don't Rwandan shopkeepers play poker?", "Because they always show their best deals! 🃏"),
            ("What's a shop owner's favorite song?", "\"Money, Money, Money\" — in RWF of course! 💰"),
            ("Why did the cashier get promoted?", "She always knew how to COUNT on herself! 🧮"),
        ],
        "rw": [
            ("Ni iki gituma umucuruzi aryama vuba?", "Kuko agomba gutera imbere mu matutwe! 😂"),
            ("Umucuruzi yashimye iki?", "Amagurishwa menshi n'amafaranga make y'inguzanyo! 💸"),
            ("Ni iki gituma iduka ry'ibitabo rigorwa?", "Kuko abaguzi barihungira mu birori! 📚"),
            ("Umucuruzi wakoze iki mu cyumweru?", "Yasize akunda amafaranga — maze agenda gushaka abaguzi benshi! 🤑"),
        ],
        "fr": [
            ("Pourquoi le commerçant est allé au cinéma?", "Pour voir un film de caisse! 🎬"),
            ("Que dit un vendeur épuisé à Kigali?", "J'en peux plus des mille collines de commandes! 😂"),
            ("Pourquoi l'inventaire était triste?", "Il se sentait en \"rupture\" émotionnelle! 📦"),
            ("Comment appelle-t-on un magasin sans clients?", "Une salle d'attente... en RWF! 😅"),
        ],
        "sw": [
            ("Kwa nini mfanyabiashara alikwenda hospitalini?", "Kwa sababu biashara yake ilikuwa 'maradhi'! 😂"),
            ("Mfanyabiashara alisema nini kwa benki?", "Tafadhali nipe mkopo — niko 'ndani ya hasara'! 💸"),
            ("Kwa nini duka halikufungua?", "Kwa sababu mmiliki alikuwa akiogopa risiti! 🧾"),
        ],
    }
    pool   = jokes.get(lang, jokes["en"])
    setup, punchline = random.choice(pool)

    follows = {
        "en": f"\n\nHope that landed! 😂\n\nAlright, back to making {name} even more profitable — want me to check how things are going today? 📊",
        "rw": f"\n\nBiraseka cyane! 😂\n\nSubiramo, reka turebe uko {name} igenda uyu munsi? 📊",
        "fr": f"\n\nJ'espère que ça vous a fait sourire! 😂\n\nBon, revenons aux affaires — on vérifie comment {name} se porte aujourd'hui? 📊",
        "sw": f"\n\nTumaini ilikufurahisha! 😂\n\nSawa, tuweke mbali utani — tuangalie jinsi {name} inavyofanya leo? 📊",
    }
    return f"{setup}\n\n👉 {punchline}{follows.get(lang, follows['en'])}"


# ── ADVICE ──────────────────────────────────────────────────────────────────

def _build_advice(ctx: dict, lang: str, message: str) -> str:
    name = _shop(ctx)
    inv  = ctx.get("inventory", {})
    low  = len(inv.get("low_stock_items", []))
    s    = _stats(ctx)
    rev  = float(s.get("revenue_month", 0))
    exp  = float(ctx.get("finances", {}).get("total_expenses_listed", 0))
    profit = rev - exp
    margin = round((profit / rev * 100), 1) if rev > 0 else 0

    # Give smart contextual advice based on actual data
    auto_advice = ""
    if low > 3:
        auto_advice = {
            "en": f"\n\n📊 Based on your current data: You have {low} items running low — this is probably the most urgent thing to address right now.",
            "rw": f"\n\n📊 Bitewe n'amakuru yawe: Ufite ibicuruzwa {low} bikenewe kuzuzwa — ibi ni byihutirwa cyane.",
            "fr": f"\n\n📊 Selon vos données: {low} articles à réapprovisionner en urgence.",
            "sw": f"\n\n📊 Kulingana na data yako: Bidhaa {low} zinahitaji kujazwa haraka.",
        }.get(lang, "")
    elif margin < 10 and rev > 0:
        auto_advice = {
            "en": f"\n\n📊 Based on your data: Your profit margin is {margin}% this month. We should look at either increasing prices or reducing your biggest expense.",
            "rw": f"\n\n📊 Bitewe n'amakuru yawe: Igenga ry'inyungu ni {margin}% uku kwezi. Dukore ku biciro cyangwa amafaranga yaguriyemo.",
            "fr": f"\n\n📊 Selon vos données: Votre marge bénéficiaire est de {margin}% ce mois. Regardons ensemble comment l'améliorer.",
            "sw": f"\n\n📊 Kulingana na data yako: Asilimia yako ya faida ni {margin}% mwezi huu. Hebu tuiangalie pamoja.",
        }.get(lang, "")

    responses = {
        "rw": f"""Nzagufasha gufata ibyemezo byiza! 🤔{auto_advice}

Mbere yo gutanga inama, ngomba kumenya ingorane yawe neza:

🔍 Mbwira ingorane cyangwa icyemezo gikomeye ufite ubu muri {name}?

Urugero bw'ibibazo nshobora gufasha:
• "Nkeneye gufata icyemezo ku biciro by'ibicuruzwa"
• "Simbizi niba ngomba kongera ububiko wa X"
• "Mbona amagurishwa agenda nabi — impamvu ni iki?"
• "Nshaka gufungura ahantu hashya"
• "Nkeneye inama ku bijyanye n'abakiriya"
• "Imari yanjye ntizima — ndakeneye inama"

Nisubiza ibyemezo bifatiye ku makuru y'ukuri ya {name}! 💬""",
        "fr": f"""Je suis là pour vous aider à décider! 🤔{auto_advice}

Avant de vous conseiller, j'ai besoin de comprendre votre situation:

🔍 Quelle est la décision ou le problème principal chez {name} en ce moment?

Exemples de questions où je peux vraiment aider:
• "Dois-je augmenter mes prix?"
• "Faut-il commander plus de stock de X?"
• "Mes ventes baissent — pourquoi?"
• "Je veux ouvrir un deuxième point de vente"
• "Comment fidéliser mes clients?"
• "Mes finances ne sont pas saines — par où commencer?"

Je base mes conseils sur vos données réelles — pas de l'intuition! 💬""",
        "en": f"""I'd love to help you think this through! 🤔{auto_advice}

Before I give advice, I want to understand your specific situation at {name}:

🔍 What's the decision or challenge you're facing right now?

Examples of things I can really dig into:
• "Should I raise my prices?"
• "I'm not sure whether to order more stock of X"
• "My sales are dropping — what's going on?"
• "I want to expand but don't know if I can afford it"
• "How do I get more customers?"
• "My finances feel messy — where do I start?"
• "Which products should I focus on?"

I'll give you advice based on your real data, not guesswork. Tell me! 💬""",
    }
    return responses.get(lang, responses["en"])


# ── PERFORMANCE ─────────────────────────────────────────────────────────────

def _build_performance(ctx: dict, lang: str) -> str:
    name  = _shop(ctx)
    s     = _stats(ctx)
    inv   = ctx.get("inventory", {})
    fin   = ctx.get("finances", {})

    rev_today   = float(s.get("revenue_today",    0))
    sales_today = int(s.get("sales_today",         0))
    rev_week    = float(s.get("revenue_week",      0))
    rev_month   = float(s.get("revenue_month",     0))
    sales_month = int(s.get("sales_month",         0))
    avg_order   = float(s.get("avg_order_value",   0))
    trend_pct   = float(s.get("revenue_trend_pct", 0))
    rev_yest    = float(s.get("revenue_yesterday", 0))
    total_prods = inv.get("total_products",        0)
    low_cnt     = len(inv.get("low_stock_items",   []))
    out_cnt     = len(inv.get("out_of_stock",      []))
    net_profit  = float(fin.get("net_profit_month",    0))
    margin      = float(fin.get("profit_margin_pct",   0))
    exp_total   = float(fin.get("total_expenses_listed", 0))
    best_day    = ctx.get("sales", {}).get("best_day", {})

    trend_icon = "📈" if trend_pct >= 0 else "📉"
    trend_note = f"\n{trend_icon} Trend vs yesterday ({_fmt(rev_yest)}): {'+' if trend_pct >= 0 else ''}{trend_pct}%" if rev_yest > 0 else ""
    health_stock = "🟢 All good" if out_cnt == 0 and low_cnt == 0 else f"🔴 {out_cnt} out of stock, 🟡 {low_cnt} running low" if out_cnt > 0 else f"🟡 {low_cnt} item(s) need restock"
    health_profit = "🟢 Profitable!" if net_profit > 0 else "🔴 Running at a loss" if net_profit < 0 else "⚪ Break even"
    best_day_note = f"\n🏆 Best day in 30 days: {best_day.get('day','?')} ({_fmt(best_day.get('revenue',0))})" if best_day else ""

    if lang == "rw":
        return f"""Dore amakuru mashya ya {name}! 📊

💰 Amafaranga Yinjiye Uyu Munsi: {_fmt(rev_today)}
🛒 Amagurishwa Uyu Munsi: {sales_today} y'amagurishwa
💵 Urusoro rw'Igurisha Rimwe: {_fmt(avg_order)}{trend_note}
📅 Amafaranga y'Icyumweru: {_fmt(rev_week)}
📆 Amafaranga y'Ukwezi: {_fmt(rev_month)} ({sales_month} y'amagurishwa){best_day_note}

💼 Imari y'Ukwezi:
• Amafaranga Yaguriyemo: {_fmt(exp_total)}
• Inyungu Nyayo: {_fmt(net_profit)} ({margin}% igenga)
• {health_profit}

📦 Imiterere y'Ububiko:
• Ibicuruzwa Byose: {total_prods}
• {health_stock}

⚡ Ibikorwa Bikurikira:
{"• ⚠️ Zuza ibicuruzwa " + str(out_cnt) + " birangiye vuba vuba — amagurishwa arashobora kuzimira!" if out_cnt > 0 else "• ✅ Ububiko bwose ni mwanya!"}
{"• 📦 Tanga ibicuruzwa " + str(low_cnt) + " bikenewe kuzuzwa mbere y'uko birangira" if low_cnt > 0 else ""}
{"• 💡 Inyungu ni nziza — funga amafaranga mu ububiko bwiyongere!" if margin > 20 else "• 💡 Tekereza kongera ibiciro byinshi cyangwa menge amafaranga yaguriyemo" if net_profit < 0 else "• 💡 Komeza gufata ibyemezo bihamye!"}

Ushaka isesengura ryimbitse? Baza gusa! 💬"""

    if lang == "fr":
        return f"""Voici les dernières nouvelles de {name}! 📊

💰 Revenu Aujourd'hui: {_fmt(rev_today)}
🛒 Ventes Aujourd'hui: {sales_today} commandes
💵 Panier Moyen: {_fmt(avg_order)}{trend_note}
📅 Revenu Cette Semaine: {_fmt(rev_week)}
📆 Revenu Ce Mois: {_fmt(rev_month)} ({sales_month} ventes){best_day_note}

💼 Finances du Mois:
• Total Dépenses: {_fmt(exp_total)}
• Bénéfice Net: {_fmt(net_profit)} (marge {margin}%)
• {health_profit}

📦 État des Stocks:
• Total Produits: {total_prods}
• {health_stock}

⚡ Actions Recommandées:
{"• ⚠️ Réapprovisionnez " + str(out_cnt) + " articles épuisés en urgence — chaque heure coûte des ventes!" if out_cnt > 0 else "• ✅ Tous les stocks sont disponibles — excellent!"}
{"• 📦 Commandez les " + str(low_cnt) + " articles en jaune avant rupture" if low_cnt > 0 else ""}
{"• 💡 Bonne marge — réinvestissez dans plus de stock!" if margin > 20 else "• 💡 Revoyez vos prix ou réduisez votre plus grosse dépense" if net_profit < 0 else "• 💡 Continuez sur cette lancée!"}

Voulez-vous approfondir un point? 💬"""

    if lang == "sw":
        return f"""Hivi ndivyo habari za hivi karibuni za {name}! 📊

💰 Mapato Leo: {_fmt(rev_today)}
🛒 Mauzo Leo: {sales_today} maagizo
💵 Thamani ya Wastani ya Agizo: {_fmt(avg_order)}{trend_note}
📅 Mapato Wiki Hii: {_fmt(rev_week)}
📆 Mapato Mwezi Huu: {_fmt(rev_month)} ({sales_month} mauzo){best_day_note}

💼 Fedha za Mwezi:
• Jumla ya Gharama: {_fmt(exp_total)}
• Faida Halisi: {_fmt(net_profit)} (asilimia {margin}%)
• {health_profit}

📦 Hali ya Akiba:
• Jumla ya Bidhaa: {total_prods}
• {health_stock}

⚡ Hatua Zinazopendekezwa:
{"• ⚠️ Jaza haraka bidhaa " + str(out_cnt) + " zilizoisha — kila saa ni hasara ya mauzo!" if out_cnt > 0 else "• ✅ Akiba zote ziko sawa — vizuri sana!"}
{"• 📦 Agiza bidhaa " + str(low_cnt) + " zinazokwisha kabla hazijaisha" if low_cnt > 0 else ""}
{"• 💡 Faida nzuri — wekeza tena kwenye akiba zaidi!" if margin > 20 else "• 💡 Kagua bei au punguza gharama kubwa" if net_profit < 0 else "• 💡 Endelea hivyo!"}

Ungependa kuchunguza zaidi? 💬"""

    return f"""Here's the full picture for {name}! 📊

💰 Revenue Today: {_fmt(rev_today)}
🛒 Sales Today: {sales_today} orders
💵 Avg Order Value: {_fmt(avg_order)}{trend_note}
📅 Revenue This Week: {_fmt(rev_week)}
📆 Revenue This Month: {_fmt(rev_month)} ({sales_month} orders){best_day_note}

💼 Monthly Finances:
• Total Expenses: {_fmt(exp_total)}
• Net Profit: {_fmt(net_profit)} ({margin}% margin)
• {health_profit}

📦 Inventory Health:
• Total Products: {total_prods}
• {health_stock}

⚡ What I'd do right now:
{"• ⚠️ Restock " + str(out_cnt) + " out-of-stock items immediately — every hour without them is lost revenue!" if out_cnt > 0 else "• ✅ All stock levels are healthy — keep it up!"}
{"• 📦 Order " + str(low_cnt) + " low-stock items before they run dry" if low_cnt > 0 else ""}
{"• 💡 Strong margin — reinvest profit into more inventory of your top sellers!" if margin > 20 else "• 💡 Review your pricing or cut your biggest expense category to improve margin" if net_profit < 0 else "• 💡 Keep making those smart daily decisions!"}

Want to dig deeper into any of these? Just ask! 💬"""


# ── INVENTORY ───────────────────────────────────────────────────────────────

def _build_inventory(ctx: dict, lang: str) -> str:
    inv      = ctx.get("inventory", {})
    low      = inv.get("low_stock_items", [])
    out      = inv.get("out_of_stock", [])
    top      = inv.get("top_by_value", [])
    total    = inv.get("total_products", 0)
    stk_val  = inv.get("total_stock_value", 0)
    all_prods= inv.get("all_product_names", [])
    name     = _shop(ctx)

    urgency = ("🔴 URGENT — stock out!" if out else "🟡 Some items low" if low else "🟢 All healthy!")

    def low_lines():
        if not low: return "  ✅ All products above minimum level — great!"
        return "\n".join(f"  ⚠️ {i.get('name','?')}: {i.get('qty',0)} left (restock at {i.get('restock_at',0)}) — {_fmt(i.get('price',0))} each" for i in low[:12])

    def out_lines():
        if not out: return "  ✅ Nothing out of stock!"
        return "\n".join(f"  🚫 {x}" for x in out[:10])

    def top_lines():
        if not top: return "  Keep recording sales to see your top performers!"
        return "\n".join(
            f"  {i+1}. {p.get('name','?')} — {p.get('qty',0)} units × {_fmt(p.get('price',0))} = {_fmt(p.get('qty',0)*float(p.get('price',0) or 0))} | margin: {p.get('margin_pct',0)}%"
            for i, p in enumerate(top[:5])
        )

    if lang == "rw":
        return f"""Reka nsesengure ububiko bwa {name} 📦

Imiterere: {urgency}
Ibicuruzwa Byose: {total} | Agaciro k'Ububiko: {_fmt(stk_val)}

⚠️ Bikenewe Kuzuzwa ({len(low)}):
{low_lines()}

🚫 Birangiye Burundu ({len(out)}):
{out_lines()}

🏆 Ibicuruzwa Bifite Agaciro Gakomeye:
{top_lines()}

💡 Inama Yanjye:
{"• Zuza vuba ibicuruzwa birangiye — amagurishwa arashobora kuzimira!" if out else "• Tanga ibicuruzwa bikenewe kuzuzwa mbere y'uko birangira."}
• Ibicuruzwa bifasha cyane bishobora gutwikiriwa neza ku bakiriya
{"• Ufite ibicuruzwa " + str(len(all_prods)) + " byose — twandike ibiciro byose neza!" if len(all_prods) > 10 else ""}

Ushaka kumenya ibyiciro byihariye? Baza! 💬"""

    if lang == "fr":
        return f"""Voici l'analyse complète de l'inventaire de {name} 📦

État Général: {urgency}
Total Produits: {total} | Valeur du Stock: {_fmt(stk_val)}

⚠️ À Réapprovisionner ({len(low)}):
{low_lines()}

🚫 En Rupture de Stock ({len(out)}):
{out_lines()}

🏆 Top Produits par Valeur:
{top_lines()}

💡 Mon Conseil:
{"• Réapprovisionnez en urgence — chaque heure de rupture = ventes perdues!" if out else "• Commandez les articles en jaune avant qu'ils s'épuisent."}
• Vos meilleurs produits méritent plus de stock et de promotion
{"• Vous avez " + str(len(all_prods)) + " produits en tout — assurez-vous d'avoir des prix à jour!" if len(all_prods) > 10 else ""}

Voulez-vous des détails sur un produit spécifique? 💬"""

    if lang == "sw":
        return f"""Hapa kuna uchambuzi kamili wa akiba ya {name} 📦

Hali ya Jumla: {urgency}
Jumla ya Bidhaa: {total} | Thamani ya Akiba: {_fmt(stk_val)}

⚠️ Zinahitaji Kujazwa ({len(low)}):
{low_lines()}

🚫 Zimeisha Kabisa ({len(out)}):
{out_lines()}

🏆 Bidhaa Bora kwa Thamani:
{top_lines()}

💡 Ushauri Wangu:
{"• Jaza haraka — kila saa ya ukosefu = mauzo yaliyopotea!" if out else "• Agiza bidhaa zinazokwisha kabla hazijaisha."}
• Bidhaa bora zaidi zinahitaji akiba zaidi na utangazaji
{"• Una bidhaa " + str(len(all_prods)) + " — hakikisha bei zote zimesasishwa!" if len(all_prods) > 10 else ""}

Ungependa maelezo zaidi kuhusu bidhaa yoyote? 💬"""

    return f"""Here's your full inventory breakdown for {name} 📦

Overall Status: {urgency}
Total Products: {total} | Total Stock Value: {_fmt(stk_val)}

⚠️ Needs Restocking ({len(low)}):
{low_lines()}

🚫 Out of Stock ({len(out)}):
{out_lines()}

🏆 Top Products by Stock Value & Margin:
{top_lines()}

💡 My take:
{"• Restock out-of-stock items ASAP — every hour without stock is money walking out the door!" if out else "• Order low-stock items before they hit zero."}
• Your best-margin products deserve priority stocking and promotion
{"• You have " + str(len(all_prods)) + " products total — make sure all prices are up to date for accurate tracking!" if len(all_prods) > 10 else ""}

Want to explore a specific product or category? Just ask! 💬"""


# ── FINANCIAL ───────────────────────────────────────────────────────────────

def _build_financial(ctx: dict, lang: str) -> str:
    s    = _stats(ctx)
    fin  = ctx.get("finances", {})
    name = _shop(ctx)

    rev_today  = float(s.get("revenue_today",  0))
    rev_week   = float(s.get("revenue_week",   0))
    rev_month  = float(s.get("revenue_month",  0))
    exp_total  = float(fin.get("total_expenses_listed", 0))
    by_cat     = fin.get("expenses_by_category", {})
    net_profit = float(fin.get("net_profit_month", 0))
    margin     = float(fin.get("profit_margin_pct", 0))
    purch_tot  = float(ctx.get("purchases", {}).get("total_spent", 0))

    health = "🟢 Profitable month!" if net_profit > 0 else "🔴 Net loss this month — action needed!"
    margin_grade = "🏆 Excellent (>30%)" if margin > 30 else "👍 Good (15-30%)" if margin > 15 else "⚠️ Needs improvement (<15%)" if margin > 0 else "🔴 Loss"

    def cat_lines():
        if not by_cat: return "  No expenses recorded yet — start tracking daily!"
        return "\n".join(f"  💸 {cat}: {_fmt(amt)} ({round(amt/exp_total*100,1) if exp_total>0 else 0}%)" for cat, amt in sorted(by_cat.items(), key=lambda x: x[1], reverse=True)[:7])

    rwanda_tip = {
        "en": "\n\n🇷🇼 Rwanda Tip: Consider accepting MTN Mobile Money & Airtel Money — shops with digital payments see 20-35% more sales on average!",
        "rw": "\n\n🇷🇼 Inama yo mu Rwanda: Fata amafaranga ya MTN Mobile Money n'Airtel Money — amaduka afata ubwishyu bw'ikirangirire abona amagurishwa menshi!",
        "fr": "\n\n🇷🇼 Conseil Rwanda: Acceptez MTN Mobile Money & Airtel Money — les commerces avec paiement mobile voient +20-35% de ventes!",
        "sw": "\n\n🇷🇼 Ushauri wa Rwanda: Kubali MTN Mobile Money & Airtel Money — maduka yanayopokea malipo ya simu yana mauzo zaidi kwa wastani!",
    }.get(lang, "")

    if lang == "rw":
        return f"""Dore isesengura ryuzuye ry'imari ya {name} 💰

📊 Amafaranga y'Ukuri:
• Yinjiye Uyu Munsi: {_fmt(rev_today)}
• Yinjiye Iki Cyumweru: {_fmt(rev_week)}
• Yinjiye Uku Kwezi: {_fmt(rev_month)}
• Yaguriyemo (yanditswe): {_fmt(exp_total)}
• Ibigurwa (byagurijwe): {_fmt(purch_tot)}
• Inyungu Nyayo y'Ukwezi: {_fmt(net_profit)}
• Igenga ry'Inyungu: {margin}% — {margin_grade}

Imiterere: {health}

💸 Amafaranga Yaguriyemo Hakurikijwe Inzego:
{cat_lines()}{rwanda_tip}

⚡ Ibikorwa Bikurikira:
{"• Igenga ryawe ni ryiza — shyira inyungu mu ububiko bwiyongere!" if net_profit > 0 and margin > 20 else "• ⚠️ Igiciro kirenze — ongesha amagurishwa cyangwa menge inzego ifite amafaranga menshi cyane" if net_profit < 0 else "• Komeza kugenzura amafaranga yaguriyemo!"}
• Reba inzego ifite amafaranga menshi — urebe aho ushobora kuzigama
• Jya wandika amafaranga yose yaguriyemo buri munsi

Ushaka isesengura ry'ibyiciro runaka? 💬"""

    if lang == "fr":
        return f"""Voici une analyse financière complète de {name} 💰

📊 Chiffres Réels:
• Revenu Aujourd'hui: {_fmt(rev_today)}
• Revenu Cette Semaine: {_fmt(rev_week)}
• Revenu Ce Mois: {_fmt(rev_month)}
• Total Dépenses Enregistrées: {_fmt(exp_total)}
• Total Achats: {_fmt(purch_tot)}
• Bénéfice Net du Mois: {_fmt(net_profit)}
• Marge: {margin}% — {margin_grade}

Santé Financière: {health}

💸 Dépenses par Catégorie:
{cat_lines()}{rwanda_tip}

⚡ Recommandations:
{"• Excellente marge — réinvestissez dans plus de stock!" if net_profit > 0 and margin > 20 else "• ⚠️ Perte nette — augmentez les ventes ou réduisez votre plus grosse dépense d'urgence" if net_profit < 0 else "• Continuez à surveiller les coûts de près!"}
• La catégorie la plus coûteuse mérite un examen approfondi
• Enregistrez toutes les dépenses quotidiennement

Voulez-vous analyser une catégorie? 💬"""

    return f"""Here's your complete financial picture for {name} 💰

📊 Real Numbers:
• Revenue Today: {_fmt(rev_today)}
• Revenue This Week: {_fmt(rev_week)}
• Revenue This Month: {_fmt(rev_month)}
• Total Recorded Expenses: {_fmt(exp_total)}
• Total Purchases (stock bought): {_fmt(purch_tot)}
• Net Profit This Month: {_fmt(net_profit)}
• Profit Margin: {margin}% — {margin_grade}

Financial Health: {health}

💸 Expenses by Category:
{cat_lines()}{rwanda_tip}

⚡ My Recommendations:
{"• Excellent margin — reinvest profit into more stock of your best sellers!" if net_profit > 0 and margin > 20 else "• ⚠️ Net loss this month — increase sales volume OR cut your biggest expense category urgently" if net_profit < 0 else "• Keep monitoring cost creep — small leaks sink big ships!"}
• Your highest expense category deserves a closer review
• Record every expense daily for accurate profit tracking

Want to explore a specific area? I'm ready! 💬"""


# ── SALES ───────────────────────────────────────────────────────────────────

def _build_sales(ctx: dict, lang: str) -> str:
    s      = _stats(ctx)
    sales  = ctx.get("sales", {})
    name   = _shop(ctx)

    rev_today   = float(s.get("revenue_today",    0))
    sales_today = int(s.get("sales_today",         0))
    rev_week    = float(s.get("revenue_week",      0))
    sales_week  = int(s.get("sales_week",          0))
    rev_month   = float(s.get("revenue_month",     0))
    sales_month = int(s.get("sales_month",         0))
    avg_order   = float(s.get("avg_order_value",   0))
    trend       = float(s.get("revenue_trend_pct", 0))
    best_day    = sales.get("best_day", {})
    daily       = [d for d in sales.get("daily_30_days", []) if isinstance(d, dict)][-14:]
    recent      = [r for r in sales.get("recent_50", []) if isinstance(r, dict)][:10]

    trend_msg = f"{'📈 Up' if trend >= 0 else '📉 Down'} {abs(trend):.1f}% vs yesterday"

    def daily_lines():
        if not daily: return "  No daily data yet"
        return "\n".join(f"  📅 {d.get('day','?')}: {_fmt(d.get('revenue',0))} ({d.get('sales_count', d.get('count',0))} sales)" for d in daily[-7:])

    def recent_lines():
        if not recent: return "  No recent transactions yet"
        lines = []
        for r in recent[:6]:
            amt  = _fmt(r.get("total_amount", r.get("amount", r.get("total", 0))))
            date = str(r.get("date", r.get("created_at", "—")))[:10]
            lines.append(f"  🧾 {date} — {amt}")
        return "\n".join(lines)

    best_note = f"\n🏆 Best day in 30 days: {best_day.get('day','?')} ({_fmt(best_day.get('revenue',0))})" if best_day else ""

    if lang == "rw":
        return f"""Reka nsesengure amagurishwa ya {name} 🛒

📊 Imibare y'Ukuri:
• Amagurishwa Uyu Munsi: {sales_today} ({_fmt(rev_today)})
• Amagurishwa Iki Cyumweru: {sales_week} ({_fmt(rev_week)})
• Amagurishwa Uku Kwezi: {sales_month} ({_fmt(rev_month)})
• Urusoro rw'Igurisha Rimwe: {_fmt(avg_order)}
• {trend_msg}{best_note}

📅 Amagurishwa y'Iminsi 7 Ishize:
{daily_lines()}

🧾 Amagurishwa Ashya:
{recent_lines()}

💡 Inama Yanjye:
• Reba amasaha menshi amagurishwa akozwe — ukore ko ibicuruzwa biriho
• Iminsi itagurishwa cyane — suzuma impamvu (ikirere, ububiko buke, ibihe)
• Ongesha ibiciro by'amagurishwa make ugereranye n'ay'andi magurishwa

Ushaka isesengura ryimbitse? 💬"""

    if lang == "fr":
        return f"""Analysons vos ventes chez {name} 🛒

📊 Chiffres Réels:
• Ventes Aujourd'hui: {sales_today} ({_fmt(rev_today)})
• Ventes Cette Semaine: {sales_week} ({_fmt(rev_week)})
• Ventes Ce Mois: {sales_month} ({_fmt(rev_month)})
• Panier Moyen: {_fmt(avg_order)}
• {trend_msg}{best_note}

📅 Performance 7 Derniers Jours:
{daily_lines()}

🧾 Transactions Récentes:
{recent_lines()}

💡 Mon Analyse:
• Identifiez vos heures de pointe et assurez-vous que les stocks suivent
• Les jours faibles méritent une enquête — météo, stock, événements?
• Fidélisez vos clients avec des petites offres sur leurs produits habituels

Vous voulez analyser un aspect particulier? 💬"""

    return f"""Let's look at your sales for {name} 🛒

📊 Real Numbers:
• Sales Today: {sales_today} orders ({_fmt(rev_today)})
• Sales This Week: {sales_week} orders ({_fmt(rev_week)})
• Sales This Month: {sales_month} orders ({_fmt(rev_month)})
• Average Order Value: {_fmt(avg_order)}
• {trend_msg}{best_note}

📅 Last 7 Days Performance:
{daily_lines()}

🧾 Recent Transactions:
{recent_lines()}

💡 What I notice:
• Find your peak sales hours and always have stock ready then
• Low-sales days deserve investigation — weather, stock gaps, or seasonal patterns?
• A simple loyalty gesture (small discount for repeat buyers) can boost frequency significantly

Want to dig into something specific? 💬"""


# ── GROWTH ──────────────────────────────────────────────────────────────────

def _build_growth(ctx: dict, lang: str) -> str:
    inv   = ctx.get("inventory", {})
    s     = _stats(ctx)
    fin   = ctx.get("finances", {})
    name  = _shop(ctx)
    top   = inv.get("top_by_value", [])
    low   = inv.get("low_stock_items", [])

    rev_month  = float(s.get("revenue_month",   0))
    exp_total  = float(fin.get("total_expenses_listed", 0))
    net_profit = float(fin.get("net_profit_month", 0))
    margin     = float(fin.get("profit_margin_pct", 0))
    suppliers  = ctx.get("partners", {}).get("total_suppliers", 0)

    def top_lines():
        if not top: return "  Record more sales to discover your top performers!"
        return "\n".join(
            f"  🥇 #{i+1}: {p.get('name','?')} — {p.get('qty',0)} units × {_fmt(p.get('price',0))} | {p.get('margin_pct',0)}% margin"
            for i, p in enumerate(top[:5])
        )

    rwanda_growth = {
        "en": f"""
🇷🇼 Rwanda-Specific Growth Strategies for {name}:
• 📱 Accept MTN & Airtel Mobile Money — reach customers who don't carry cash
• 🤝 Form a buying group with nearby shops — bulk prices from suppliers mean higher margins
• 📣 Use WhatsApp to notify loyal customers about new stock or deals
• 🏪 Display your top-margin products at eye level — placement increases sales by 30%
• 📊 Track which day of the week brings most sales — and prepare extra stock for it""",
        "rw": f"""
🇷🇼 Inama zo Gutera Imbere mu Rwanda:
• 📱 Fata MTN & Airtel Mobile Money — bakiriya benshi bagurisha bakoresheje telefone
• 🤝 Korana n'amaduka aho hafi — gutura hamwe bituma mubona ibiciro byiza ku baganishi
• 📣 Koresha WhatsApp kumenyesha abakiriya b'uburangiranwe ku bicuruzwa bishya
• 🏪 Shyira ibicuruzwa bifasha cyane mu mwanya mugaragara — ibiciro n'ahantu ni ingenzi
• 📊 Reba umunsi munini ufite amagurishwa urebesha ko ibicuruzwa biriho""",
        "fr": f"""
🇷🇼 Stratégies de Croissance Rwanda pour {name}:
• 📱 Acceptez MTN & Airtel Mobile Money — plus de clients potentiels
• 🤝 Formez un groupement d'achat avec des commerces voisins — meilleurs prix fournisseurs
• 📣 Utilisez WhatsApp pour informer vos clients fidèles des nouveautés
• 🏪 Placez vos produits à marge élevée à la hauteur des yeux
• 📊 Identifiez votre meilleur jour et préparez des stocks supplémentaires""",
        "sw": f"""
🇷🇼 Mikakati ya Ukuaji Rwanda kwa {name}:
• 📱 Kubali MTN & Airtel Mobile Money — fikia wateja wengi zaidi
• 🤝 Unda kikundi cha ununuzi na maduka ya jirani — bei bora kwa wasambazaji
• 📣 Tumia WhatsApp kuwajulisha wateja waaminifu kuhusu bidhaa mpya
• 🏪 Weka bidhaa za faida nyingi mahali ambapo macho yanaona kwanza
• 📊 Tambua siku yako bora ya mauzo na uwe tayari na akiba zaidi""",
    }

    if lang == "rw":
        return f"""Dore amahirwe yo gutera imbere ya {name}! 📈

🏆 Ibicuruzwa Bifasha Cyane:
{top_lines()}

💰 Imari y'Iterambere:
• Amafaranga Yinjiye Uku Kwezi: {_fmt(rev_month)}
• Inyungu Nyayo: {_fmt(net_profit)} ({margin}% igenga)
• Abaganishi Bawe: {suppliers}

🚀 Inama 3 Ngamba Zo Gutera Imbere:
1️⃣ {"Zuza ibicuruzwa " + str(len(low)) + " bikenewe mbere y'uko birangira!" if low else "Ububiko ni mwanya — funga amafaranga mu bicuruzwa bifasha cyane!"}
2️⃣ {"Igenga ryawe ni ryiza — shyira inyungu mu bicuruzwa bifasha cyane!" if margin > 20 else "Tekereza kongera ibiciro by'ibicuruzwa bifasha cyane cyangwa menge inzego ifite amafaranga menshi."}
3️⃣ Teranya ibicuruzwa bigurwa buri gihe kugira ngo buri gurishwa bibe byinshi
{rwanda_growth.get(lang, rwanda_growth["en"])}

Ushaka inama kuri ibicuruzwa bihariye? 💬"""

    if lang == "fr":
        return f"""Voici vos opportunités de croissance réelles pour {name}! 📈

🏆 Vos Meilleurs Produits:
{top_lines()}

💰 Contexte Financier:
• Revenu Ce Mois: {_fmt(rev_month)}
• Bénéfice Net: {_fmt(net_profit)} (marge {margin}%)
• Fournisseurs Actifs: {suppliers}

🚀 Mes 3 Recommandations Clés:
1️⃣ {"Réapprovisionnez " + str(len(low)) + " articles en urgence — ne perdez pas de ventes!" if low else "Stocks sains — réinvestissez dans plus de vos meilleurs produits!"}
2️⃣ {"Excellente marge — investissez les bénéfices dans plus de stock!" if margin > 20 else "Améliorez vos prix ou réduisez votre plus grosse dépense pour améliorer la marge."}
3️⃣ Créez des offres groupées avec vos articles populaires pour augmenter le panier moyen
{rwanda_growth.get(lang, rwanda_growth["en"])}

Voulez-vous des conseils spécifiques? 💬"""

    return f"""Here are your real growth opportunities for {name}! 📈

🏆 Your Top Products by Value:
{top_lines()}

💰 Financial Context:
• Revenue This Month: {_fmt(rev_month)}
• Net Profit: {_fmt(net_profit)} ({margin}% margin)
• Active Suppliers: {suppliers}

🚀 My Top 3 Recommendations:
1️⃣ {"Restock " + str(len(low)) + " low items before they run dry — lost stock = lost sales!" if low else "Stock levels healthy — double down on your top-selling products!"}
2️⃣ {"Strong margin — reinvest profits into more inventory of your best performers!" if margin > 20 else "Improve your pricing on top products OR cut your biggest expense to boost margin."}
3️⃣ Bundle complementary products together — it increases average order value without extra customers
{rwanda_growth.get("en", "")}

Want product-specific growth advice? Just ask! 💬"""


# ── PURCHASES ───────────────────────────────────────────────────────────────

def _build_purchases(ctx: dict, lang: str) -> str:
    purch    = ctx.get("purchases", {})
    partners = ctx.get("partners", {})
    name     = _shop(ctx)

    recent        = [p for p in purch.get("recent", []) if isinstance(p, dict)]
    total_spent   = float(purch.get("total_spent", 0))
    count         = int(purch.get("count", 0))
    supplier_cnt  = partners.get("total_suppliers", 0)
    supplier_names= partners.get("supplier_names", [])

    def purch_lines():
        if not recent: return "  No recent purchases recorded yet"
        lines = []
        for p in recent[:8]:
            amt  = _fmt(p.get("total_amount", p.get("amount", p.get("total", 0))))
            date = str(p.get("date", p.get("created_at", "—")))[:10]
            prod = p.get("product_name", p.get("item_name", p.get("name", "—")))
            sup  = p.get("supplier_name", p.get("supplier", ""))
            lines.append(f"  🚚 {date} — {prod}{' from ' + sup if sup else ''}: {amt}")
        return "\n".join(lines)

    def sup_lines():
        if not supplier_names: return "  No suppliers recorded yet"
        return "\n".join(f"  🤝 {s}" for s in supplier_names[:8])

    if lang == "rw":
        return f"""Dore isesengura ry'ibigurwa n'abaganishi ba {name} 🚚

📊 Incamake:
• Abaganishi Bose: {supplier_cnt}
• Ibigurwa Byagurijwe (vuba): {count}
• Amafaranga Yaguriyemo: {_fmt(total_spent)}

🤝 Abaganishi Bawe:
{sup_lines()}

🕐 Ibigurwa Bishya:
{purch_lines()}

💡 Inama Yanjye:
• Kigereranye ibigurwa byagurijwe vuba n'ububiko bwawe bw'ubu
• Gura ibicuruzwa bikenewe mbere y'uko birangira — wirekera akaga
• Gerageza gutura amasezerano n'abaganishi beza kugira ngo ubike ibiciro byiza
• Reba niba ufite abaganishi benshi ku bicuruzwa bimwe — ubika umwe wiza

Ushaka isesengura ryimbitse? 💬"""

    if lang == "fr":
        return f"""Voici l'analyse des achats et fournisseurs de {name} 🚚

📊 Résumé:
• Total Fournisseurs: {supplier_cnt}
• Achats Récents: {count}
• Total Dépensé en Achats: {_fmt(total_spent)}

🤝 Vos Fournisseurs:
{sup_lines()}

🕐 Achats Récents:
{purch_lines()}

💡 Mon Conseil:
• Comparez vos achats récents avec votre stock actuel
• Commandez avant la rupture — ne réagissez pas, anticipez!
• Négociez des tarifs dégressifs avec vos fournisseurs les plus utilisés
• Un seul bon fournisseur par catégorie vaut mieux que plusieurs moyens

Voulez-vous analyser vos achats en détail? 💬"""

    return f"""Here's your purchasing & supplier overview for {name} 🚚

📊 Summary:
• Total Suppliers: {supplier_cnt}
• Recent Purchases Recorded: {count}
• Total Spent on Stock: {_fmt(total_spent)}

🤝 Your Suppliers:
{sup_lines()}

🕐 Recent Purchases:
{purch_lines()}

💡 My suggestions:
• Cross-check recent purchases against current stock — make sure what you bought is where it should be
• Order before you run out — proactive restocking beats reactive panic buying every time
• Negotiate volume discounts with your top suppliers — even 5% off adds up significantly over a year
• Consolidate: one reliable supplier per category is better than three unreliable ones

Want a deeper dive? Just ask! 💬"""


# ── EXPENSES DETAIL ─────────────────────────────────────────────────────────

def _build_expenses_detail(ctx: dict, lang: str) -> str:
    fin  = ctx.get("finances", {})
    name = _shop(ctx)

    exp_total  = float(fin.get("total_expenses_listed", 0))
    by_cat     = fin.get("expenses_by_category", {})
    recent_exp = fin.get("recent_expenses", [])
    rev_month  = float(_stats(ctx).get("revenue_month", 0))

    def cat_lines():
        if not by_cat: return "  No expenses recorded yet."
        lines = []
        for cat, amt in sorted(by_cat.items(), key=lambda x: x[1], reverse=True)[:8]:
            pct = round(amt/exp_total*100, 1) if exp_total > 0 else 0
            of_rev = round(amt/rev_month*100, 1) if rev_month > 0 else 0
            lines.append(f"  💸 {cat}: {_fmt(amt)} — {pct}% of expenses, {of_rev}% of revenue")
        return "\n".join(lines)

    def recent_lines():
        if not recent_exp: return "  No recent expenses recorded."
        return "\n".join(
            f"  📝 {e['date']}: {e['description']} [{e['category']}] — {_fmt(e['amount'])}"
            for e in recent_exp[:8]
        )

    biggest = max(by_cat.items(), key=lambda x: x[1]) if by_cat else ("—", 0)

    if lang == "rw":
        return f"""Isesengura ryimbitse ry'amafaranga yaguriyemo ya {name} 💸

📊 Incamake:
• Amafaranga Yaguriyemo Yose: {_fmt(exp_total)}
• Inzego Zose: {len(by_cat)}
• Inzego Ifite Amafaranga Menshi: {biggest[0]} ({_fmt(biggest[1])})

💸 Hakurikijwe Inzego:
{cat_lines()}

📝 Amafaranga Yaguriyemo Vuba:
{recent_lines()}

💡 Inama Yanjye:
• Inzego ifite amafaranga menshi cyane ni yo ikenewe kureba cyane
• Jya wandika amafaranga yose yaguriyemo buri munsi — ufate inshingano
• Reba niba amafaranga yaguriyemo yiyongera cyangwa agabanutsa buri kwezi

Ushaka isesengura ry'inzego runaka? 💬"""

    return f"""Here's your detailed expense breakdown for {name} 💸

📊 Summary:
• Total Expenses Recorded: {_fmt(exp_total)}
• Expense Categories: {len(by_cat)}
• Biggest Expense Category: {biggest[0]} ({_fmt(biggest[1])})

💸 Expenses by Category (with % of revenue):
{cat_lines()}

📝 Recent Expenses:
{recent_lines()}

💡 My Analysis:
• Your biggest expense category ({biggest[0]}) deserves the most scrutiny — even a 10% cut there makes a real difference
• Record every expense daily — gaps in tracking = invisible profit leaks
• Check if any category is growing month over month — that's where surprises come from

Want to explore a specific category? 💬"""


# ── SUPPLIERS ───────────────────────────────────────────────────────────────

def _build_suppliers(ctx: dict, lang: str) -> str:
    partners     = ctx.get("partners", {})
    name         = _shop(ctx)
    sup_cnt      = partners.get("total_suppliers", 0)
    sup_names    = partners.get("supplier_names", [])
    sup_preview  = [s for s in partners.get("list_preview", []) if isinstance(s, dict)]

    def sup_lines():
        if not sup_preview:
            if sup_names: return "\n".join(f"  🤝 {s}" for s in sup_names[:10])
            return "  No suppliers recorded yet — add your first supplier in the Partners section!"
        lines = []
        for s in sup_preview[:8]:
            sname = s.get("name", s.get("company_name", "—"))
            phone = s.get("phone", s.get("tel", ""))
            lines.append(f"  🤝 {sname}{' | 📞 ' + phone if phone else ''}")
        return "\n".join(lines)

    if lang == "rw":
        return f"""Dore abaganishi ba {name} 🤝

📊 Incamake:
• Abaganishi Bose: {sup_cnt}

🤝 Urutonde rw'Abaganishi:
{sup_lines()}

💡 Inama Yanjye:
• Buri baganishi ashobora guha ibiciro by'inshuro — bana inama za reka
• Gira abaganishi 2 ku bicuruzwa bikomeye — niba umwe abura, undi azaruha
• Fata ibiciro byanditse ku baganishi bose kugira ngo ugereranye buri gihe
• Abaganishi bazima ni bo batanga ibicuruzwa byiza kandi bivugwaho rumwe

Ushaka kumenya ibyerekeye umuganishi runaka? 💬"""

    return f"""Here's your supplier directory for {name} 🤝

📊 Summary:
• Total Suppliers Registered: {sup_cnt}

🤝 Your Suppliers:
{sup_lines()}

💡 Smart Supplier Tips:
• Always have 2 suppliers for your top 3 products — if one runs out, you keep selling
• Negotiate 30-day payment terms with your most reliable suppliers — it helps cash flow
• Keep written price lists from all suppliers and compare quarterly
• Rate your suppliers: quality, reliability, and price — drop the consistently poor ones

Want details on a specific supplier or buying strategy? 💬"""


# ── COMPARISON ──────────────────────────────────────────────────────────────

def _build_comparison(ctx: dict, lang: str) -> str:
    s    = _stats(ctx)
    name = _shop(ctx)

    rev_today  = float(s.get("revenue_today",    0))
    rev_week   = float(s.get("revenue_week",     0))
    rev_month  = float(s.get("revenue_month",    0))
    rev_yest   = float(s.get("revenue_yesterday", 0))
    trend      = float(s.get("revenue_trend_pct", 0))
    daily      = [d for d in ctx.get("sales", {}).get("daily_30_days", []) if isinstance(d, dict)]

    # Week-over-week from daily data
    wow = "N/A"
    if len(daily) >= 14:
        try:
            this_week = sum(float(d.get("revenue",0)) for d in daily[-7:])
            last_week = sum(float(d.get("revenue",0)) for d in daily[-14:-7])
            if last_week > 0:
                wow_pct = round(((this_week - last_week) / last_week) * 100, 1)
                wow = f"{'📈' if wow_pct >= 0 else '📉'} {abs(wow_pct)}% {'up' if wow_pct >= 0 else 'down'} vs last week"
        except Exception:
            pass

    if lang == "rw":
        return f"""Ugereranye imiterere ya {name} 📊

📈 Ubuhinduzi bwa Amagurishwa:
• Uyu Munsi: {_fmt(rev_today)} vs Ejo ({_fmt(rev_yest)}): {'📈' if trend >= 0 else '📉'} {abs(trend):.1f}%
• Iki Cyumweru vs Gishize: {wow}
• Uku Kwezi: {_fmt(rev_month)}
• Icyumweru Cyose: {_fmt(rev_week)}

💡 Inama:
{"• Amagurishwa ariyongera — komeza uwo mugambi!" if trend > 0 else "• Amagurishwa aragabanutse — reba impamvu (ububiko, ikirere, ibihe byihariye)"}
• Kigereranye ibiciro byawe n'iby'amaduka aho hafi — urebe niba uri mu mwanya mwiza

Ushaka isesengura ryimbitse? 💬"""

    return f"""Here's your performance comparison for {name} 📊

📈 Revenue Trends:
• Today vs Yesterday: {_fmt(rev_today)} vs {_fmt(rev_yest)} → {'📈' if trend >= 0 else '📉'} {abs(trend):.1f}%
• This Week vs Last Week: {wow}
• This Month Total: {_fmt(rev_month)}
• This Week Total: {_fmt(rev_week)}

💡 What This Tells Me:
{"• Revenue is trending upward — whatever you're doing is working!" if trend > 0 else "• Revenue dipped vs yesterday — check if it's stock, seasonal, or something external."}
• Compare your busiest and quietest days to spot patterns and prepare accordingly

Want a deeper trend analysis? 💬"""


# ── PREDICTION ──────────────────────────────────────────────────────────────

def _build_prediction(ctx: dict, lang: str) -> str:
    s     = _stats(ctx)
    name  = _shop(ctx)
    daily = [d for d in ctx.get("sales", {}).get("daily_30_days", []) if isinstance(d, dict)]

    rev_month = float(s.get("revenue_month", 0))
    now       = datetime.now(timezone.utc)
    day_of_month = now.day
    days_left = 30 - day_of_month

    projected = 0.0
    if day_of_month > 0 and rev_month > 0:
        daily_avg = rev_month / day_of_month
        projected = round(rev_month + daily_avg * days_left, 0)

    # 30-day avg from historical
    hist_avg = 0.0
    if len(daily) >= 7:
        try:
            hist_avg = sum(float(d.get("revenue", 0)) for d in daily) / len(daily)
        except Exception:
            pass

    if lang == "rw":
        return f"""Iri ni irindiro ry'uko {name} izagenda mu minsi izaza 🔮

📊 Ibaze ry'Ukwezi:
• Uyu munsi ni ku wa {day_of_month} w'ukwezi — hasigaye iminsi {days_left}
• Amafaranga Yinjiye Kugeza Ubu: {_fmt(rev_month)}
• Ubika buri munsi ngana: {_fmt(rev_month / max(day_of_month, 1))}
• **Ibaze ry'ukwezi wose: {_fmt(projected)}**

📈 Kugenda kw'Amafaranga:
• Amafaranga yo buri munsi (mu minsi {len(daily)} ishize): {_fmt(hist_avg)}

⚠️ Icyitonderwa:
Ibi ni ibaze gusa bitewe n'amakuru y'ubu. Amafaranga nyayo azashingira ku:
• Imiterere y'ububiko (zuza ibicuruzwa bikenewe!)
• Gutera imbere k'amagurishwa (shinga intego!)
• Ibihe by'imvura/izuba mu Rwanda

Ushaka inama zo gera kuri iyo ntego? 💬"""

    return f"""Here's my projection for {name} based on current trends 🔮

📊 Month Projection:
• Today is day {day_of_month} of the month — {days_left} days remaining
• Revenue So Far This Month: {_fmt(rev_month)}
• Average Daily Revenue (this month): {_fmt(rev_month / max(day_of_month, 1))}
• **Projected Month-End Revenue: {_fmt(projected)}**

📈 Historical Context:
• Average Daily Revenue (last {len(daily)} days of data): {_fmt(hist_avg)}

⚠️ Important Caveat:
This is an estimate based on current pace. Actual results depend on:
• Keeping stock levels full (restock proactively!)
• Seasonal patterns in Rwanda (rainy season, market days, holidays)
• Any promotions or changes you make

Want advice on how to actually hit or beat that projection? 💬"""


# ── FULL REPORT ─────────────────────────────────────────────────────────────

def _build_full_report(ctx: dict, lang: str) -> str:
    now   = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    name  = _shop(ctx)
    s     = _stats(ctx)
    fin   = ctx.get("finances", {})

    rev_month  = float(s.get("revenue_month", 0))
    net_profit = float(fin.get("net_profit_month", 0))
    margin     = float(fin.get("profit_margin_pct", 0))
    total_p    = ctx.get("inventory", {}).get("total_products", 0)
    sup_cnt    = ctx.get("partners", {}).get("total_suppliers", 0)
    out_cnt    = len(ctx.get("inventory", {}).get("out_of_stock", []))
    low_cnt    = len(ctx.get("inventory", {}).get("low_stock_items", []))

    headers = {
        "en": f"📋 COMPLETE BUSINESS REPORT — {name}\n🕐 Generated: {now}\n{'─'*40}",
        "rw": f"📋 RAPORO YUZUYE Y'UBUCURUZI — {name}\n🕐 Yakozwe: {now}\n{'─'*40}",
        "fr": f"📋 RAPPORT COMMERCIAL COMPLET — {name}\n🕐 Généré le: {now}\n{'─'*40}",
        "sw": f"📋 RIPOTI KAMILI YA BIASHARA — {name}\n🕐 Imetolewa: {now}\n{'─'*40}",
    }
    div = f"\n{'─'*40}\n"
    closers = {
        "en": f"\n\n{'─'*40}\n📌 EXECUTIVE SUMMARY:\n• Monthly Revenue: {_fmt(rev_month)} | Net Profit: {_fmt(net_profit)} ({margin}% margin)\n• Products: {total_p} | Suppliers: {sup_cnt} | Stock Alerts: {out_cnt} out + {low_cnt} low\n• Status: {'🟢 Healthy' if net_profit > 0 and out_cnt == 0 else '🟡 Needs Attention' if net_profit > 0 else '🔴 Urgent Action Needed'}\n\nThat's your complete picture! What would you like to explore further? 💬",
        "rw": f"\n\n{'─'*40}\n📌 INCAMAKE:\n• Amafaranga y'Ukwezi: {_fmt(rev_month)} | Inyungu: {_fmt(net_profit)} ({margin}%)\n• Ibicuruzwa: {total_p} | Abaganishi: {sup_cnt} | Inzitizi: {out_cnt} birangiye + {low_cnt} bikenewe\n• Imiterere: {'🟢 Byiza' if net_profit > 0 and out_cnt == 0 else '🟡 Bisaba Uburinzi' if net_profit > 0 else '🔴 Bisaba Ibikorwa Byihutirwa'}\n\nIyo ni raporo yuzuye! Ushaka kuzamura icyiciro runaka? 💬",
        "fr": f"\n\n{'─'*40}\n📌 RÉSUMÉ EXÉCUTIF:\n• Revenu Mensuel: {_fmt(rev_month)} | Bénéfice: {_fmt(net_profit)} ({margin}%)\n• Produits: {total_p} | Fournisseurs: {sup_cnt} | Alertes: {out_cnt} ruptures + {low_cnt} bas\n• Statut: {'🟢 Sain' if net_profit > 0 and out_cnt == 0 else '🟡 Attention Requise' if net_profit > 0 else '🔴 Action Urgente'}\n\nVoilà votre tableau complet! Que voulez-vous approfondir? 💬",
        "sw": f"\n\n{'─'*40}\n📌 MUHTASARI:\n• Mapato ya Mwezi: {_fmt(rev_month)} | Faida: {_fmt(net_profit)} ({margin}%)\n• Bidhaa: {total_p} | Wasambazaji: {sup_cnt} | Tahadhari: {out_cnt} zimeisha + {low_cnt} zinakwisha\n• Hali: {'🟢 Nzuri' if net_profit > 0 and out_cnt == 0 else '🟡 Inahitaji Uangalifu' if net_profit > 0 else '🔴 Hatua za Haraka Zinahitajika'}\n\nHiyo ndiyo picha yako kamili! Ungependa kuchunguza zaidi? 💬",
    }

    return (
        headers.get(lang, headers["en"])
        + div + _build_performance(ctx, lang)
        + div + _build_inventory(ctx, lang)
        + div + _build_financial(ctx, lang)
        + div + _build_sales(ctx, lang)
        + closers.get(lang, closers["en"])
    )


# ── UNKNOWN ─────────────────────────────────────────────────────────────────

def _build_unknown(message: str, lang: str) -> str:
    short = message[:60] + ("…" if len(message) > 60 else "")
    responses = {
        "rw": f"""Hmm, simeze neza neza: "{short}" 🤔

Ariko nshobora gufasha ku bibazo nk'ibi:

📊 "Iduka ryanjye rigenze bite uyu munsi?"
📦 "Ni ibicuruzwa bihe bikenewe kuzuzwa?"
💰 "Isesengura ry'imari yanjye?"
🛒 "Amagurishwa yanjye yo muri iki cyumweru?"
📈 "Inama zo kongera ubucuruzi?"
🚚 "Abaganishi banjye ni bande?"
📋 "Mpore raporo yuzuye"
😊 Cyangwa baza "Muraho!" duganire!
😂 Cyangwa sema "Mpore akajwi" nkusetse!

Gerageza! 💬""",
        "fr": f"""Hmm, je n'ai pas tout à fait compris: "{short}" 🤔

Je suis spécialisé dans les conseils commerciaux, mais essayez:

📊 "Comment va mon commerce aujourd'hui?"
📦 "Quels produits réapprovisionner?"
💰 "Analyse de mes finances"
🛒 "Mes ventes cette semaine?"
📈 "Comment croître?"
🚚 "Mes fournisseurs?"
📋 "Rapport complet"
😊 Ou juste "Bonjour!" pour discuter!

Je ferai de mon mieux! 💬""",
        "sw": f"""Hmm, sielewi vizuri: "{short}" 🤔

Lakini ninaweza kukusaidia na:

📊 "Biashara yangu inakwenda vipi leo?"
📦 "Bidhaa zipi zinahitaji kujazwa?"
💰 "Uchambuzi wa fedha zangu"
🛒 "Mauzo ya wiki hii?"
📈 "Ninawezaje kukua?"
🚚 "Wasambazaji wangu ni nani?"
📋 "Tengeneza ripoti kamili"
😊 Au sema tu "Habari!" tuongee!

Niulize chochote! 💬""",
        "en": f"""Hmm, I'm not quite sure about: "{short}" 🤔

No worries though — here's what I'm great at:

📊 "How is my business doing today?"
📦 "Which products need restocking?"
💰 "Give me a financial overview"
🛒 "Show me my sales this week"
📈 "How can I grow my business?"
🚚 "Tell me about my suppliers"
💸 "Break down my expenses"
📋 "Generate a full business report"
😊 Or just say "Hi!" — I'm happy to chat!
😂 Or ask for a joke if you need a laugh!

What's on your mind? I'm here! 💬""",
    }
    return responses.get(lang, responses["en"])


# ── PUBLIC ENTRY POINT ───────────────────────────────────────────────────────

def generate_reply(
    user_message: str,
    context:      dict,
    language:     str,
    history:      list,
) -> tuple[str, int, int, float, int]:
    t0     = time.perf_counter()
    intent = _detect_intent(user_message)

    message_aware = {"smalltalk", "advice"}

    dispatch = {
        "greeting":        _build_greeting,
        "thanks":          _build_thanks,
        "help":            _build_help,
        "motivation":      _build_motivation,
        "emotion_stress":  _build_stress,
        "emotion_happy":   _build_happy,
        "smalltalk":       _build_smalltalk,
        "joke":            _build_joke,
        "advice":          _build_advice,
        "performance":     _build_performance,
        "inventory":       _build_inventory,
        "financial":       _build_financial,
        "expenses_detail": _build_expenses_detail,
        "suppliers":       _build_suppliers,
        "sales":           _build_sales,
        "growth":          _build_growth,
        "purchases":       _build_purchases,
        "comparison":      _build_comparison,
        "prediction":      _build_prediction,
        "report":          _build_full_report,
    }

    builder = dispatch.get(intent)
    if builder is None:
        reply = _build_unknown(user_message, language)
    elif intent in message_aware:
        reply = builder(context, language, user_message)
    else:
        reply = builder(context, language)

    elapsed_ms = int((time.perf_counter() - t0) * 1000)
    return reply, 0, 0, 0.0, elapsed_ms
