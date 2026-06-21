"""
Standalone AI Business Advisor Engine — conversational, friendly, multilingual.
No external API. Intent detection + real shop data + warm response templates.
Supports: English (en), Kinyarwanda (rw), French (fr), Swahili (sw).
"""
from __future__ import annotations
import time
from datetime import datetime, timezone
from typing import Any

# ── Intent keyword map ───────────────────────────────────────────────────────

_INTENTS = {
    "greeting": [
        "hi", "hello", "hey", "good morning", "good afternoon", "good evening",
        "what's up", "sup", "howdy", "greetings",
        "muraho", "mwaramutse", "mwiriwe", "bite", "amakuru",
        "bonjour", "bonsoir", "salut", "coucou", "bonne journée",
        "habari", "jambo", "hujambo", "karibu", "salam",
    ],
    "emotion_stress": [
        "stress", "stressed", "tired", "exhausted", "overwhelm", "overwhelmed",
        "anxious", "anxiety", "worried", "worry", "scared", "afraid", "nervous",
        "struggling", "struggle", "hard time", "difficult", "tough", "rough",
        "frustrated", "frustrat", "giving up", "i quit", "can't do this",
        "losing hope", "hopeless", "burned out", "burnout", "depressed",
        # rw
        "nshakaye", "birangoye", "umunaniro", "ndananiwe", "biragoye",
        # fr
        "stressé", "fatigué", "épuisé", "inquiet", "difficile", "découragé",
        # sw
        "nimechoka", "wasiwasi", "nimeshuka", "ngumu", "shida",
    ],
    "emotion_happy": [
        "happy", "excited", "great day", "amazing", "wonderful", "fantastic",
        "doing well", "good news", "celebrating", "made a sale", "big sale",
        "proud", "success", "won", "milestone", "achievement",
        # rw
        "numereye neza", "nezerwa", "nishimiye", "inkuru nziza",
        # fr
        "heureux", "content", "bonne nouvelle", "réussite", "succès",
        # sw
        "furaha", "nimefurahi", "habari njema", "mafanikio",
    ],
    "smalltalk": [
        "how are you", "how do you do", "how's it going", "you okay",
        "are you real", "do you feel", "are you human", "are you alive",
        "do you understand", "can you think", "what do you think",
        "tell me something", "talk to me", "i'm bored", "just chatting",
        "let's talk", "what's new", "anything interesting",
        "what time", "what day", "what's today",
        # rw
        "urakora ite", "uriho", "wigeze wibaza",
        # fr
        "comment tu vas", "tu vas bien", "c'est quoi ton avis", "parle moi",
        # sw
        "uko vipi", "wewe ni nani", "unafikiria nini",
    ],
    "joke": [
        "joke", "funny", "make me laugh", "tell me a joke", "humor",
        "something funny", "cheer me up", "laugh",
        # rw
        "ntabwo ngukunda", "ndashaka gusetsa",
        # fr
        "blague", "fais moi rire", "quelque chose de drôle",
        # sw
        "utani", "nichekesha", "kitu cha kuchekesha",
    ],
    "advice": [
        "what should i do", "i need advice", "help me decide", "what do you think",
        "advice", "suggest", "should i", "is it a good idea", "what would you do",
        "not sure what to do", "confused", "lost", "don't know",
        # rw
        "nkire inama", "nagomba inama", "nkore iki",
        # fr
        "que faire", "conseil", "tu penses quoi", "qu'est-ce que je dois faire",
        # sw
        "nifanye nini", "nisaidie", "ushauri",
    ],
    "thanks": [
        "thank", "thanks", "thank you", "appreciate", "great", "awesome",
        "perfect", "helpful", "nice", "good job", "well done",
        "murakoze", "urakoze", "ni byiza", "ni nziza",
        "merci", "super", "parfait", "excellent", "c'est bien",
        # sw
        "asante", "nashukuru", "vizuri sana", "nzuri",
    ],
    "help": [
        "help", "what can you", "what do you", "how do you", "capabilities",
        "what are you", "who are you", "tell me about", "your name",
        # rw
        "nshobora", "ubufasha", "urikora iki",
        # fr
        "aide", "que peux-tu", "qui es-tu", "comment tu",
        # sw
        "msaada", "unaweza", "wewe ni nani", "unafanya nini",
    ],
    "performance": [
        "performance", "how is", "how am i", "doing today", "summary", "overview",
        "status", "business today", "shop today", "how are", "situation", "check",
        "imiterere", "uko bigenze", "incamake", "uyu munsi",
        "comment va", "résumé", "bilan", "aujourd'hui",
        "utendaji", "jinsi", "muhtasari", "leo",
    ],
    "inventory": [
        "stock", "inventory", "restock", "low", "out of", "product", "item",
        "running out", "empty", "shortage", "refill", "quantity", "warehouse",
        "ububiko", "ibicuruzwa", "birangiye", "bikenewe", "kuzuza",
        "inventaire", "réapprovisionner", "rupture", "articles",
        "akiba", "bidhaa", "imalizika", "kujaza", "stoo",
    ],
    "financial": [
        "revenue", "profit", "expense", "cost", "money", "income", "loss",
        "earning", "spending", "financial", "finance", "cash", "budget",
        "amafaranga", "inyungu", "igiciro", "umusaruro", "ibyaguriye",
        "revenu", "dépense", "coût", "argent", "bénéfice", "perte",
        "mapato", "faida", "gharama", "pesa", "hasara", "fedha",
    ],
    "sales": [
        "sale", "sales", "transaction", "sold", "customer", "order", "recent",
        "today sale", "sell", "buyers",
        "amagurishwa", "igurisha", "abakiriya",
        "vente", "ventes", "vendu", "client", "commande",
        "mauzo", "uuzaji", "muamala", "wateja",
    ],
    "growth": [
        "grow", "growth", "improve", "best product", "top product", "opportunity",
        "increase", "focus", "strategy", "recommend", "suggestion", "advice",
        "tip", "tips",
        "gutera imbere", "ibicuruzwa byiza", "inama", "ingenzi",
        "croissance", "meilleur produit", "améliorer", "opportunité", "conseil",
        "ukuaji", "bidhaa bora", "kuboresha", "fursa", "ushauri",
    ],
    "purchases": [
        "purchase", "bought", "supplier", "buying", "reorder", "procurement",
        "ibigurwa", "abaganishi", "kugura",
        "achat", "fournisseur", "approvisionnement",
        "manunuzi", "wasambazaji", "kununua",
    ],
    "report": [
        "report", "full report", "complete", "everything", "all data", "detailed",
        "generate report", "monthly report", "weekly report",
        "raporo", "raporo yose", "byose",
        "rapport", "rapport complet", "tout",
        "ripoti", "ripoti kamili", "kila kitu",
    ],
}

# ── Helpers ──────────────────────────────────────────────────────────────────

def _fmt_rwf(amount: Any) -> str:
    try:
        v = float(amount)
        return f"{v:,.0f} RWF"
    except Exception:
        return "—"


def _pct_change(current: float, previous: float) -> str:
    if previous == 0:
        return "new"
    pct = ((current - previous) / previous) * 100
    arrow = "📈" if pct >= 0 else "📉"
    return f"{arrow} {abs(pct):.1f}% {'up' if pct >= 0 else 'down'}"


def _detect_intent(message: str) -> str:
    lower = message.lower()
    scores: dict[str, int] = {k: 0 for k in _INTENTS}
    for intent, keywords in _INTENTS.items():
        for kw in keywords:
            if kw in lower:
                scores[intent] += 1
    best = max(scores, key=lambda k: scores[k])
    return best if scores[best] > 0 else "performance"


def _shop_name(ctx: dict) -> str:
    return ctx.get("shop", {}).get("name", "your shop")


# ── Conversational handlers ──────────────────────────────────────────────────

def _build_greeting(ctx: dict, lang: str) -> str:
    name = _shop_name(ctx)
    hour = datetime.now(timezone.utc).hour
    time_greet = "Good morning" if hour < 12 else "Good afternoon" if hour < 17 else "Good evening"

    if lang == "rw":
        return f"""Muraho! 👋 Ikaze kuri Higoverse AI Advisor!

Ndi umufasha wawe w'ubucuruzi. Nshobora kukugezaho amakuru y'uko {name} igenda.

Reka nkwereke ibintu nshobora gukora:

📊 Imiterere y'iduka — Ni gute ubucuruzi bwawe bugeze uyu munsi?
📦 Ububiko — Ni ibicuruzwa bihe bikenewe kuzuzwa?
💰 Imari — Amafaranga yinjiye, yaguriyemo, n'inyungu
🛒 Amagurishwa — Amagurishwa y'uyumunsi n'icyumweru
📈 Gutera imbere — Inama zo kongera ubucuruzi
📋 Raporo yuzuye — Isesengura ryose

Wandikie ikibazo cyose, nzasubiza vuba! 😊"""

    if lang == "fr":
        return f"""{time_greet}! 👋 Bienvenue sur Higoverse AI Advisor!

Je suis votre assistant commercial intelligent. Je peux analyser les données de {name} en temps réel.

Voici ce que je peux faire pour vous:

📊 Performance — Comment va votre commerce aujourd'hui?
📦 Inventaire — Quels articles manquent de stock?
💰 Finances — Revenus, dépenses et bénéfices
🛒 Ventes — Analyse de vos transactions
📈 Croissance — Opportunités et recommandations
📋 Rapport complet — Tout en un seul coup d'œil

Posez-moi n'importe quelle question! 😊"""

    if lang == "sw":
        return f"""{time_greet}! 👋 Karibu kwa Higoverse AI Advisor!

Mimi ni mshauri wako wa biashara. Naweza kukuonyesha jinsi {name} inavyofanya.

Hivi ndivyo ninavyoweza kukusaidia:

📊 Utendaji — Biashara yako inakwenda vipi leo?
📦 Akiba — Bidhaa zipi zinahitaji kujazwa?
💰 Fedha — Mapato, gharama na faida
🛒 Mauzo — Uchambuzi wa miamala yako
📈 Ukuaji — Fursa na mapendekezo
📋 Ripoti kamili — Kila kitu kwa pamoja

Niulize chochote! 😊"""

    return f"""{time_greet}! 👋 Welcome to Higoverse AI Advisor!

I'm your intelligent business companion. I have real-time access to {name}'s data and can help you make smarter decisions.

Here's what I can do for you:

📊 Performance check — How is your business doing today?
📦 Inventory analysis — Which products need restocking?
💰 Financial overview — Revenue, expenses, and profit
🛒 Sales breakdown — Today's and this week's transactions
📈 Growth tips — Opportunities and recommendations
📋 Full business report — Everything at a glance

Just ask me anything — I'm here to help! 😊"""


def _build_thanks(ctx: dict, lang: str) -> str:
    if lang == "rw":
        return """Nta kibazo! 😊 Ni ugushimwa gukorana nawe.

Ese hari ikindi kintu wifuza kumenya ku bijyanye n'ubucuruzi bwawe? Nshobora gusesengura:

• 📊 Imiterere y'iduka ryawe
• 📦 Imiterere y'ububiko
• 💰 Isesengura ry'imari
• 📈 Inama zo gutera imbere

Baza igihe cyose ushaka! 🚀"""

    if lang == "fr":
        return """De rien! 😊 C'est un plaisir de travailler avec vous.

Y a-t-il autre chose que vous aimeriez savoir sur votre commerce?

• 📊 Performance du jour
• 📦 État des stocks
• 💰 Analyse financière
• 📈 Opportunités de croissance

N'hésitez pas à poser d'autres questions! 🚀"""

    if lang == "sw":
        return """Karibu sana! 😊 Ni furaha kufanya kazi nawe.

Je, kuna kitu kingine ungependa kujua kuhusu biashara yako?

• 📊 Utendaji wa leo
• 📦 Hali ya akiba
• 💰 Uchambuzi wa fedha
• 📈 Fursa za ukuaji

Niulize wakati wowote! 🚀"""

    return """You're very welcome! 😊 It's a pleasure helping you run a smarter business.

Is there anything else you'd like to explore?

• 📊 Today's performance overview
• 📦 Inventory & stock levels
• 💰 Financial analysis
• 📈 Growth opportunities & tips

I'm always here — just ask! 🚀"""


def _build_help(ctx: dict, lang: str) -> str:
    name = _shop_name(ctx)
    if lang == "rw":
        return f"""Ndwitwa Higoverse AI Advisor! 🤖

Ndi umufasha w'ubucuruzi wubakiwe kugenzura amakuru ya {name} kandi nkugezaho inama z'ukuri.

🧠 IBINTU NSHOBORA GUKORA:

📊 Imiterere — Gusesengura amagurishwa n'amafaranga y'uyu munsi
📦 Ububiko — Kugaragaza ibicuruzwa bikenewe cyangwa birangiye
💰 Imari — Isesengura ry'amafaranga yinjiye, yaguriyemo n'inyungu
🛒 Amagurishwa — Gusesengura amagurishwa yayu munsi n'iy'icyumweru
📈 Gutera imbere — Inama n'amahirwe yo kongera ubucuruzi
🚚 Ibigurwa — Gusesengura ibigurwa n'abaganishi
📋 Raporo yuzuye — Isesengura ryose hamwe

💬 Nshobora kuvugana nawe mu Kinyarwanda, Icyongereza, Igifaransa, cyangwa Kiswahili!

Baza ikibazo cyose! 😊"""

    if lang == "fr":
        return f"""Je suis Higoverse AI Advisor! 🤖

Je suis votre assistant commercial intelligent qui analyse les données de {name} en temps réel.

🧠 MES CAPACITÉS:

📊 Performance — Analyse des ventes et revenus du jour
📦 Inventaire — Articles en rupture ou à faible stock
💰 Finances — Revenus, dépenses et bénéfice net
🛒 Ventes — Transactions du jour et de la semaine
📈 Croissance — Recommandations et opportunités
🚚 Achats — Historique et analyse fournisseurs
📋 Rapport complet — Vue d'ensemble complète

💬 Je parle Français, Anglais, Kinyarwanda et Swahili!

Posez-moi n'importe quelle question! 😊"""

    if lang == "sw":
        return f"""Mimi ni Higoverse AI Advisor! 🤖

Mimi ni mshauri wako wa biashara anayechambua data ya {name} wakati halisi.

🧠 NINAVYOWEZA KUKUSAIDIA:

📊 Utendaji — Uchambuzi wa mauzo na mapato ya leo
📦 Akiba — Bidhaa zinazokwisha au zilizoisha
💰 Fedha — Mapato, gharama na faida halisi
🛒 Mauzo — Miamala ya leo na ya wiki
📈 Ukuaji — Mapendekezo na fursa
🚚 Manunuzi — Historia na uchambuzi wa wasambazaji
📋 Ripoti kamili — Muhtasari wa kila kitu

💬 Ninazungumza Kiswahili, Kiingereza, Kifaransa na Kinyarwanda!

Niulize chochote! 😊"""

    return f"""I'm Higoverse AI Advisor! 🤖

I'm your intelligent business companion with real-time access to {name}'s data — ready to give you honest, data-driven insights.

🧠 WHAT I CAN DO:

📊 Performance check — How your business is doing right now
📦 Inventory analysis — Which products need attention
💰 Financial overview — Revenue, expenses & net profit
🛒 Sales breakdown — Today's and this week's transactions
📈 Growth opportunities — Actionable tips to grow faster
🚚 Purchase analysis — Supplier & restocking overview
📋 Full business report — Everything in one comprehensive view

💬 I speak English, Kinyarwanda, French & Swahili — your choice!

What would you like to know? 😊"""


# ── Human conversation handlers ──────────────────────────────────────────────

def _build_stress(ctx: dict, lang: str) -> str:
    name = _shop_name(ctx)
    if lang == "rw":
        return f"""Numva bimeze neza ko ubibaza. 🤝

Ubucuruzi bugeza abantu benshi mu bihe bikomeye — si wowe gusa.

Izi nizo mpamvu nyinshi ziteranya ubucuruzi n'umunaniro:
• Amagurishwa agenda nabi udashakashaka
• Amafaranga yaguriyemo yiyongera vuba
• Ububiko burimo ingorane
• Gutwara umutwe byinshi mu gihe kimwe

Ibintu 3 bishobora gufasha ubu:

1️⃣ Tuma amakuru y'ukuri — reba imiterere y'iduka ryawe {name} ubu, hanyuma dufatanye ibyemezo bihamye
2️⃣ Icyo kintu kimwe — ntukore byinshi hamwe. Hitamo ingorane imwe ikomeye maze tuyisubiremo
3️⃣ Kubahiriza ibyo wageze — reba amagurishwa yawe n'inyungu uzibuke inkomoko

Mbwira ibintu bikurindira — nzagufasha usangire ingorane imwe na rimwe! 💪"""

    if lang == "fr":
        return f"""Je comprends, et c'est tout à fait normal de ressentir ça. 🤝

Gérer un commerce peut être épuisant — vous n'êtes pas seul(e).

Les causes fréquentes de stress en commerce:
• Les ventes qui baissent sans raison apparente
• Les coûts qui augmentent plus vite que les revenus
• Les problèmes de stock et de fournisseurs
• Trop de choses à gérer en même temps

3 choses qui peuvent aider maintenant:

1️⃣ Voyons les chiffres réels — regardons ensemble l'état de {name} aujourd'hui
2️⃣ Une chose à la fois — identifions le problème numéro 1 et attaquons-le
3️⃣ Reconnaissez vos succès — regardez ce que vous avez accompli jusqu'ici

Dites-moi ce qui vous pèse le plus en ce moment — on règle ça ensemble! 💪"""

    if lang == "sw":
        return f"""Naelewa, na ni kawaida kuhisi hivyo. 🤝

Kuendesha biashara kunaweza kuchoshea — huwezi kuwa peke yako katika hili.

Sababu za kawaida za msongo katika biashara:
• Mauzo yanayoshuka bila sababu
• Gharama zinazoongezeka haraka kuliko mapato
• Matatizo ya akiba na wasambazaji
• Mambo mengi sana kufanya kwa wakati mmoja

Mambo 3 yanayoweza kusaidia sasa hivi:

1️⃣ Hebu tuangalie nambari halisi — tuchunguze hali ya {name} leo pamoja
2️⃣ Kitu kimoja kwa wakati mmoja — taitambue tatizo kuu moja na tulishughulikie
3️⃣ Tambua mafanikio yako — angalia ulichofika

Niambie kinachokusumbua zaidi sasa hivi — tutashughulikia pamoja! 💪"""

    return f"""Hey, I hear you — and it's completely okay to feel that way. 🤝

Running a business is genuinely hard, and stress is part of the journey. You're not alone in this.

Common reasons business owners feel overwhelmed:
• Sales fluctuating without clear reason
• Costs creeping up faster than revenue
• Stock and supplier headaches
• Too many decisions to make at once

Here's what usually helps:

1️⃣ Look at the real numbers — let me pull up {name}'s actual data so we work from facts, not fear
2️⃣ One thing at a time — tell me what's worrying you most and we'll tackle just that
3️⃣ Count your wins — you built something real, and that matters

What's weighing on you most right now? I'm listening, and we'll figure it out together. 💪"""


def _build_happy(ctx: dict, lang: str) -> str:
    name = _shop_name(ctx)
    if lang == "rw":
        return f"""Nishimiye cyane kumva inkuru nziza! 🎉

Ibikorwa byiza bikwiye gushimiwa — wiha agaciro gakwiye!

Ukomeze ukomeze aho wari — ariko nshobora kukugezaho amakuru y'uko {name} igenda kandi ufate muri iyi myanya myiza:

• 📊 Reba imiterere y'iduka uyu munsi
• 📈 Reba amahirwe yo kongera ubucuruzi
• 💰 Suzuma imari yawe ubike inzira yo imbere

Mbwira iby'uyu munsi wagize byiza! 🚀"""

    if lang == "fr":
        return f"""C'est fantastique à entendre! 🎉

Prenez un moment pour célébrer — vous le méritez vraiment!

Profitons de cette énergie positive pour {name}. Quand on est dans un bon état d'esprit, c'est le meilleur moment pour:

• 📊 Vérifier vos chiffres du jour
• 📈 Explorer les opportunités de croissance
• 💰 Planifier la prochaine étape

Dites-moi ce qui s'est bien passé aujourd'hui! 🚀"""

    if lang == "sw":
        return f"""Hiyo ni habari nzuri sana! 🎉

Chukua muda kusherehekea — unastahili!

Hebu tutumie nguvu hii nzuri kwa {name}. Wakati wa furaha ndio wakati bora wa:

• 📊 Kuangalia nambari za leo
• 📈 Kuchunguza fursa za ukuaji
• 💰 Kupanga hatua inayofuata

Niambie kilichoenda vizuri leo! 🚀"""

    return f"""That's wonderful to hear! 🎉

Take a moment to appreciate that — seriously, you earned it!

Let's channel that energy into {name}. Good days are the perfect time to:

• 📊 Check today's numbers while you're in a winning mindset
• 📈 Think about growth opportunities
• 💰 Plan your next move from a position of strength

Tell me what went well — and let's see how we can build on it! 🚀"""


def _build_smalltalk(ctx: dict, lang: str, message: str) -> str:
    lower = message.lower()
    name  = _shop_name(ctx)
    hour  = datetime.now(timezone.utc).hour
    day   = datetime.now(timezone.utc).strftime("%A, %B %d")

    # "how are you"
    if any(w in lower for w in ["how are you", "how do you do", "uko vipi", "comment tu vas", "urakora ite"]):
        if lang == "rw":
            return f"""Nkora neza cyane, murakoze kubaza! 😊

Ndi hano buri gihe, gufasha abacuruzi nka wewe gutera imbere. Uyu munsi ni {day}.

Wowe urakora ite? {name} igenda bite? Mbwira ibintu bikurindira — nzagufasha! 💬"""
        if lang == "fr":
            return f"""Je vais très bien, merci de demander! 😊

Je suis ici 24h/24 pour aider les commerçants comme vous. Aujourd'hui c'est {day}.

Et vous, comment ça va? {name} se porte bien? Dites-moi ce qui se passe! 💬"""
        if lang == "sw":
            return f"""Niko vizuri sana, asante kwa kuuliza! 😊

Nipo hapa siku na usiku kusaidia wafanyabiashara kama wewe. Leo ni {day}.

Je wewe uko vipi? {name} inakwenda vipi? Niambie kinachoendelea! 💬"""
        return f"""I'm doing great, thanks for asking! 😊

I'm here around the clock helping business owners like you make smarter decisions. Today is {day}.

How about you? How are things going at {name}? Tell me what's on your mind! 💬"""

    # "are you real / human / AI"
    if any(w in lower for w in ["are you real", "are you human", "are you alive", "do you feel", "can you think", "wewe ni nani"]):
        if lang == "rw":
            return """Mbaza ikibazo cyiza! 🤖

Ndi AI — sisoma nka muntu, ariko nabanye n'amakuru y'ubucuruzi bwawe kandi mpanga ibisubizo by'ukuri.

Ibintu ntakora:
• Ntagira amarangamutima — ariko nshobora kumva ingorane zawe no gutera imbere
• Siniruka — ariko nzabaho igihe cyose ukeneye
• Sisobanuza byose — ariko ku bibazo by'ubucuruzi ndi inzobere

Ibintu nakora neza:
• 📊 Isesengura ry'amakuru y'iduka ryawe
• 💡 Inama zihamye zifatiye ku makuru
• 💬 Gutumanahana nawe igihe cyose

Birakagirwa ko hari ibintu bishobora kuntera ingorane — ariko nzajya niha akamaro! 😊"""
        if lang == "fr":
            return """Bonne question! 🤖

Je suis une IA — je ne ressens pas les choses comme un humain, mais j'ai accès à vos données réelles et je construis des réponses honnêtes basées sur des faits.

Ce que je ne peux PAS faire:
• Ressentir des émotions — mais je peux comprendre vos défis
• Me tromper intentionnellement — je dis toujours ce que les données montrent
• Tout savoir — mais sur votre commerce, je suis assez bon!

Ce que je FAIS très bien:
• 📊 Analyser les données réelles de votre commerce
• 💡 Donner des conseils basés sur les faits
• 💬 Être disponible quand vous en avez besoin

Je ne suis peut-être pas humain — mais je suis sincèrement là pour vous aider! 😊"""
        return """Great question! 🤖

I'm an AI — I don't feel things the way you do, but I genuinely have access to your real shop data and I give you honest, fact-based answers.

What I CAN'T do:
• Feel emotions — but I can understand your challenges and respond thoughtfully
• Lie to you — I always tell you what the data actually shows
• Know everything — but about your specific business, I'm pretty sharp!

What I DO really well:
• 📊 Analyze your real business data in real time
• 💡 Give you honest advice based on actual numbers
• 💬 Be available whenever you need me, no judgment

I may not be human — but I genuinely care about helping your business succeed! 😊"""

    # "what time / what day"
    if any(w in lower for w in ["what time", "what day", "what's today", "date"]):
        period = "morning ☀️" if hour < 12 else "afternoon 🌤️" if hour < 17 else "evening 🌙"
        if lang == "rw":
            return f"""Uyu munsi ni {day}, {hour:02d}:00 UTC. 🕐

Imiterere y'iduka ryawe ni iyihe uyu {period.split()[0]}? Mbwira! 💬"""
        if lang == "fr":
            return f"""Aujourd'hui c'est {day}, {hour:02d}:00 UTC. 🕐

Comment se passe votre {period.split()[0]}? Dites-moi! 💬"""
        return f"""It's {day}, {hour:02d}:00 UTC — {period}. 🕐

How's your {period.split()[0]} going at {name}? Ask me anything! 💬"""

    # generic smalltalk
    if lang == "rw":
        return f"""Nshimishwa kuganira nawe! 😊

Ndi umufasha wawe w'ubucuruzi, kandi nshobora gufasha cyane aho ubucuruzi buhuriye na we.

Uyu munsi buri neza? {name} igenda bite? Baza ikibazo cyose cyerekeye ubucuruzi bwawe — nzasubiza neza! 💬"""
    if lang == "fr":
        return f"""Ravi de discuter avec vous! 😊

Je suis votre conseiller commercial — je suis meilleur sur les sujets liés à votre business qu'en bavardage général, mais je suis là!

Votre journée se passe bien? {name} va bien? Posez-moi n'importe quelle question sur votre commerce! 💬"""
    if lang == "sw":
        return f"""Ninafurahi kuzungumza nawe! 😊

Mimi ni mshauri wako wa biashara — ninaelewa zaidi kuhusu biashara yako kuliko mazungumzo ya kawaida.

Siku yako inaenda vipi? {name} inakwenda vipi? Niulize chochote kuhusu biashara yako! 💬"""
    return f"""Always happy to chat! 😊

I'm your business companion — I'm much better at business talk than small talk, but I'm still here for you!

How's your day going? How's {name} treating you today? Ask me anything business-related and I'll give you real, data-backed answers! 💬"""


def _build_joke(ctx: dict, lang: str) -> str:
    import random
    jokes_en = [
        ("Why did the shop owner go to art school?", "Because he wanted to improve his \"sale\" techniques! 🎨"),
        ("Why did the cashier get promoted?", "Because she always knew how to \"count\" on herself! 💰"),
        ("What do you call a business that sells only mirrors?", "A company you can really see yourself working for! 🪞"),
        ("Why don't business owners ever win at cards?", "Because they always fold under pressure! 🃏"),
        ("What's a shopkeeper's favorite type of music?", "Cash flow! 🎵"),
    ]
    jokes_fr = [
        ("Pourquoi le commerçant est allé au cinéma?", "Pour voir un film de caisse! 🎬"),
        ("Que dit un vendeur épuisé?", "J'en peux plus des soldes! 😂"),
        ("Pourquoi l'inventaire était triste?", "Parce qu'il se sentait en \"rupture de stock\" émotionnelle! 📦"),
    ]
    jokes_rw = [
        ("Ni iki gituma umucuruzi aryama vuba?", "Kuko agomba gutera imbere mu matutwe! 😂"),
        ("Umucuruzi yashimye iki?", "Amagurishwa menshi n'amafaranga make y'inguzanyo! 💸"),
    ]
    jokes_sw = [
        ("Kwa nini mfanyabiashara alikwenda hospitalini?", "Kwa sababu biashara yake ilikuwa 'maradhi'! 😂"),
        ("Mfanyabiashara alisema nini kwa benki?", "Tafadhali nipe mkopo — niko 'ndani ya hasara'! 💸"),
    ]

    pool = jokes_rw if lang == "rw" else jokes_fr if lang == "fr" else jokes_sw if lang == "sw" else jokes_en
    setup, punchline = random.choice(pool)

    if lang == "rw":
        return f"""Ibi biraseka! 😄

{setup}

👉 {punchline}

Hahaha! Ntukunde cyane? 😂

Kandi ubizi, igihe kirahagije — reka turebe uko {_shop_name(ctx)} igenda uyu munsi! 📊"""
    if lang == "fr":
        return f"""Voilà qui va vous faire sourire! 😄

{setup}

👉 {punchline}

Ha! J'espère que ça vous a fait rire! 😂

Bon, trêve de plaisanteries — on jette un œil sur {_shop_name(ctx)}? 📊"""
    if lang == "sw":
        return f"""Hii itakufurahisha! 😄

{setup}

👉 {punchline}

Haha! Tumaini ilikufurahisha! 😂

Sawa, tuweke mbali utani kwa sasa — tuangalie jinsi {_shop_name(ctx)} inavyofanya leo? 📊"""
    return f"""Here's one that might make you smile! 😄

{setup}

👉 {punchline}

Ha! Hope that landed! 😂

Alright, back to business — want me to check how {_shop_name(ctx)} is doing today? 📊"""


def _build_advice(ctx: dict, lang: str, message: str) -> str:
    name = _shop_name(ctx)
    if lang == "rw":
        return f"""Nzagufasha gufata ibyemezo byiza! 🤔

Mbere yo gutanga inama, ngomba kumenya byinshi:

🔍 Mbwira ingorane cyangwa icyemezo gikomeye ufite ubu muri {name}?

Urugero:
• "Nkeneye gufata icyemezo ku biciro by'ibicuruzwa"
• "Simbizi niba ngomba kongera ububiko"
• "Mbona ibicuruzwa birangira ariko biraruhije"
• "Simbizi niba ngomba gufungura ahantu hashya"

Nisubiza ibyemezo bifatiye ku makuru y'ukuri y'iduka ryawe — si igitekerezo gusa!

Mbwira ingorane yawe nyayo! 💬"""
    if lang == "fr":
        return f"""Je suis là pour vous aider à décider! 🤔

Avant de vous conseiller, j'ai besoin de comprendre votre situation:

🔍 Quelle est la décision ou le problème principal que vous affrontez dans {name} en ce moment?

Par exemple:
• "Je ne sais pas si je dois augmenter mes prix"
• "J'hésite à commander plus de stock"
• "Je perds des clients mais je ne sais pas pourquoi"
• "Je veux ouvrir un deuxième magasin"

Je base mes conseils sur vos données réelles — pas de l'intuition aléatoire!

Décrivez votre situation et on analyse ensemble! 💬"""
    if lang == "sw":
        return f"""Niko hapa kukusaidia kufanya maamuzi mazuri! 🤔

Kabla ya kukupa ushauri, nahitaji kuelewa hali yako:

🔍 Ni tatizo gani au uamuzi gani mkubwa unakabiliana nao katika {name} sasa hivi?

Mfano:
• "Sijui kama niongeze bei za bidhaa"
• "Ninasita kuagiza bidhaa zaidi"
• "Ninapoteza wateja lakini sijui kwa nini"
• "Nataka kufungua duka jingine"

Ninakupa ushauri kulingana na data halisi ya biashara yako — si nadharia tu!

Niambie hali yako na tutachambua pamoja! 💬"""
    return f"""I'd love to help you think this through! 🤔

Before I give advice, I need to understand your situation better:

🔍 What's the specific decision or challenge you're facing at {name} right now?

For example:
• "Should I raise my prices?"
• "I'm not sure whether to order more stock"
• "I'm losing customers but don't know why"
• "I want to expand but I'm not sure if I can afford it"

I base my advice on your actual data, not guesswork — so the more specific you are, the better I can help!

Tell me what's on your mind and let's work through it together! 💬"""


# ── Data-driven response builders ────────────────────────────────────────────

def _build_performance(ctx: dict, lang: str) -> str:
    shop      = ctx.get("shop", {})
    sales     = ctx.get("sales", {})
    stats     = sales.get("stats", {})
    finances  = ctx.get("finances", {})
    inventory = ctx.get("inventory", {})
    daily     = sales.get("daily_14_days", [])

    shop_name     = shop.get("name", "Your Shop")
    revenue_today = stats.get("revenue_today", stats.get("today_revenue", 0))
    sales_today   = stats.get("sales_today",   stats.get("today_count",   0))
    revenue_month = stats.get("revenue_month", stats.get("month_revenue", 0))
    expense_total = finances.get("total_expenses_listed", 0)
    profit_est    = float(revenue_today) * 0.3
    low_stock_cnt = len(inventory.get("low_stock_items", []))
    total_prods   = inventory.get("total_products", 0)

    trend = ""
    if isinstance(daily, list) and len(daily) >= 2:
        try:
            last   = float(daily[-1].get("revenue", 0))
            before = float(daily[-2].get("revenue", 0))
            trend  = f"\n📊 Trend vs yesterday: {_pct_change(last, before)}"
        except Exception:
            pass

    health = "🟢 Looking good!" if low_stock_cnt == 0 else f"🟡 {low_stock_cnt} item(s) need restocking"

    if lang == "rw":
        return f"""Dore amakuru mashya ya {shop_name}! 📊

💰 Amafaranga Yinjiye Uyu Munsi: {_fmt_rwf(revenue_today)}
🛒 Amagurishwa Uyu Munsi: {sales_today} y'amagurishwa
📅 Amafaranga y'Uku Kwezi: {_fmt_rwf(revenue_month)}
💡 Inyungu Yibazwa (~30%): {_fmt_rwf(profit_est)}
📦 Ibicuruzwa Muri Ububiko: {total_prods}{trend}

🏥 Imiterere y'Ububiko: {health}

⚡ Ibigomba Gukozwe:
{"• Zuza ibicuruzwa " + str(low_stock_cnt) + " bikenewe kuzuzwa byihuse!" if low_stock_cnt > 0 else "• Ububiko bwose buri mwanya — komeza gutanga!"}
• Kigereranye amafaranga yinjiye n'ay'ukwezi gushize
• Suzuma amafaranga yaguriyemo ushake aho ushobora kuzigama

Ese ushaka ko nsesengura ibyiciro runaka? Baza gusa! 💬"""

    if lang == "fr":
        return f"""Voici les dernières nouvelles de {shop_name}! 📊

💰 Revenu Aujourd'hui: {_fmt_rwf(revenue_today)}
🛒 Ventes Aujourd'hui: {sales_today} commandes
📅 Revenu du Mois: {_fmt_rwf(revenue_month)}
💡 Bénéfice Estimé (~30%): {_fmt_rwf(profit_est)}
📦 Produits en Stock: {total_prods}{trend}

🏥 Santé du Stock: {health}

⚡ Actions Recommandées:
{"• Réapprovisionnez " + str(low_stock_cnt) + " article(s) en urgence!" if low_stock_cnt > 0 else "• Tous les stocks sont sains — continuez comme ça!"}
• Comparez avec le mois dernier pour repérer les tendances
• Analysez les dépenses pour identifier des économies

Voulez-vous approfondir un point particulier? 💬"""

    if lang == "sw":
        return f"""Hivi ndivyo habari za hivi karibuni za {shop_name}! 📊

💰 Mapato Leo: {_fmt_rwf(revenue_today)}
🛒 Mauzo Leo: {sales_today} maagizo
📅 Mapato ya Mwezi: {_fmt_rwf(revenue_month)}
💡 Faida Inayokadiriwa (~30%): {_fmt_rwf(profit_est)}
📦 Bidhaa Zilizopo: {total_prods}{trend}

🏥 Hali ya Akiba: {health}

⚡ Hatua Zinazopendekezwa:
{"• Jaza bidhaa " + str(low_stock_cnt) + " haraka kabla hazijaisha!" if low_stock_cnt > 0 else "• Akiba zote ziko sawa — endelea hivyo!"}
• Linganisha na mwezi uliopita kuona mwelekeo
• Kagua gharama ili kupata uokoaji

Ungependa kuchunguza kitu chochote zaidi? 💬"""

    return f"""Here's the latest on {shop_name}! 📊

💰 Revenue Today: {_fmt_rwf(revenue_today)}
🛒 Sales Today: {sales_today} orders
📅 Revenue This Month: {_fmt_rwf(revenue_month)}
💡 Estimated Profit Today (~30%): {_fmt_rwf(profit_est)}
📦 Products in Inventory: {total_prods}{trend}

🏥 Stock Health: {health}

⚡ What I'd recommend right now:
{"• Restock " + str(low_stock_cnt) + " low-stock item(s) before you miss sales!" if low_stock_cnt > 0 else "• Stock levels are all healthy — great job!"}
• Compare this month's revenue with last month to spot the trend
• Review your top expense category for potential savings

Want me to dig deeper into any of these? Just ask! 💬"""


def _build_inventory(ctx: dict, lang: str) -> str:
    inventory = ctx.get("inventory", {})
    low       = inventory.get("low_stock_items", [])
    out       = inventory.get("out_of_stock", [])
    top       = inventory.get("top_by_value", [])
    total     = inventory.get("total_products", 0)

    def low_lines():
        if not low:
            return "  ✅ All products are above restock level — great!"
        return "\n".join(
            f"  ⚠️ {i.get('name','?')}: {i.get('qty',0)} left (restock at {i.get('restock_at',0)})"
            for i in low[:10]
        )

    def out_lines():
        if not out:
            return "  ✅ Nothing out of stock!"
        return "  🚫 " + "\n  🚫 ".join(str(x) for x in out[:8])

    def top_lines():
        if not top:
            return "  No data yet — record more stock to see rankings"
        return "\n".join(
            f"  {idx+1}. {i.get('name','?')} — {i.get('qty',0)} units @ {_fmt_rwf(i.get('price',0))}"
            for idx, i in enumerate(top[:5])
        )

    urgency = "🔴 Urgent restocking needed!" if out else ("🟡 Some items running low" if low else "🟢 Inventory is in great shape!")

    if lang == "rw":
        return f"""Reka nsesengure ububiko bwawe 📦

Imiterere Rusange: {urgency}
Ibicuruzwa Byose: {total}

⚠️ Bikenewe Kuzuzwa ({len(low)}):
{low_lines()}

🚫 Birangiye Burundu ({len(out)}):
{out_lines()}

🏆 Ibicuruzwa Bifite Agaciro Gakomeye:
{top_lines()}

💡 Inama Yanjye:
{"Zuza vuba ibicuruzwa birangiye — birateza akagero k'amagurishwa!" if out else "Tanga ibicuruzwa bikenewe kuzuzwa mbere y'uko birangira."}
Ibicuruzwa bifasha cyane bishobora gutwikiriwa neza.

Ushaka kumenya ibyiciro byihariye? Baza! 💬"""

    if lang == "fr":
        return f"""Voici l'analyse de votre inventaire 📦

État Général: {urgency}
Total Produits: {total}

⚠️ À Réapprovisionner ({len(low)}):
{low_lines()}

🚫 En Rupture de Stock ({len(out)}):
{out_lines()}

🏆 Top Produits par Valeur:
{top_lines()}

💡 Mon Conseil:
{"Réapprovisionnez en urgence les articles épuisés — chaque heure de rupture = ventes perdues!" if out else "Commandez les articles en jaune avant qu'ils s'épuisent."}
Vos meilleurs produits méritent plus de stock et de visibilité.

Vous voulez plus de détails? Demandez! 💬"""

    if lang == "sw":
        return f"""Hapa kuna uchambuzi wa akiba yako 📦

Hali ya Jumla: {urgency}
Jumla ya Bidhaa: {total}

⚠️ Zinahitaji Kujazwa ({len(low)}):
{low_lines()}

🚫 Zimeisha Kabisa ({len(out)}):
{out_lines()}

🏆 Bidhaa Bora kwa Thamani:
{top_lines()}

💡 Ushauri Wangu:
{"Jaza haraka bidhaa zilizoisha — kila saa ya ukosefu = mauzo yaliyopotea!" if out else "Agiza bidhaa zinazokwisha kabla hazijaisha."}
Bidhaa bora zaidi zinahitaji akiba zaidi na uonekano.

Ungependa maelezo zaidi? Niulize! 💬"""

    return f"""Let me break down your inventory for you 📦

Overall Status: {urgency}
Total Products: {total}

⚠️ Needs Restocking ({len(low)}):
{low_lines()}

🚫 Out of Stock ({len(out)}):
{out_lines()}

🏆 Top Products by Stock Value:
{top_lines()}

💡 My take:
{"Restock out-of-stock items ASAP — every hour without stock is lost revenue!" if out else "Order low-stock items before they run out completely."}
Your best-value products deserve priority stocking and maybe some promotion.

Want to explore a specific product or category? Just ask! 💬"""


def _build_financial(ctx: dict, lang: str) -> str:
    sales    = ctx.get("sales", {})
    stats    = sales.get("stats", {})
    finances = ctx.get("finances", {})

    revenue_today = stats.get("revenue_today",  stats.get("today_revenue",  0))
    revenue_month = stats.get("revenue_month",  stats.get("month_revenue",  0))
    expense_total = finances.get("total_expenses_listed", 0)
    by_cat        = finances.get("expenses_by_category", {})
    net_profit    = float(revenue_month) - float(expense_total)
    margin        = (net_profit / float(revenue_month) * 100) if float(revenue_month) > 0 else 0

    health = "🟢 Profitable!" if net_profit > 0 else "🔴 Net loss — action needed!"
    margin_note = "Excellent margin! 🎉" if margin > 30 else ("Good margin 👍" if margin > 15 else "Margin needs improvement ⚠️")

    def cat_lines():
        if not by_cat:
            return "  No expense breakdown yet — start recording expenses!"
        sorted_cats = sorted(by_cat.items(), key=lambda x: float(x[1]), reverse=True)
        return "\n".join(f"  💸 {cat}: {_fmt_rwf(amt)}" for cat, amt in sorted_cats[:6])

    if lang == "rw":
        return f"""Dore isesengura ry'imari yawe 💰

📊 Imari y'Ukweli:
• Amafaranga Yinjiye Uyu Munsi: {_fmt_rwf(revenue_today)}
• Amafaranga Yinjiye Uku Kwezi: {_fmt_rwf(revenue_month)}
• Amafaranga Yaguriyemo: {_fmt_rwf(expense_total)}
• Inyungu Nyayo y'Ukwezi: {_fmt_rwf(net_profit)}
• Igenga ry'Inyungu: {margin:.1f}%

Imiterere: {health} — {margin_note}

💸 Amafaranga Yaguriyemo Hakurikijwe Inzego:
{cat_lines()}

💡 Inama Yanjye:
{"Igenga ryawe ni ryiza — komeza kugenzura no kuzigama!" if net_profit > 0 else "⚠️ Igiciro kirenze amafaranga yinjiye. Ongesha amagurishwa cyangwa menge amafaranga yaguriyemo bihuse."}
Inzego zifite amafaranga menshi zirasabwa isesengura ryimbitse.

Ushaka isesengura ry'ibyiciro runaka? 💬"""

    if lang == "fr":
        return f"""Voici une analyse complète de vos finances 💰

📊 Chiffres Réels:
• Revenu Aujourd'hui: {_fmt_rwf(revenue_today)}
• Revenu du Mois: {_fmt_rwf(revenue_month)}
• Total Dépenses: {_fmt_rwf(expense_total)}
• Bénéfice Net du Mois: {_fmt_rwf(net_profit)}
• Marge Bénéficiaire: {margin:.1f}%

Santé Financière: {health} — {margin_note}

💸 Dépenses par Catégorie:
{cat_lines()}

💡 Mon Conseil:
{"Bonne santé financière — continuez à surveiller et optimiser!" if net_profit > 0 else "⚠️ Perte nette ce mois. Augmentez les ventes ou réduisez les coûts d'urgence."}
La catégorie la plus coûteuse mérite un examen approfondi.

Vous voulez analyser une catégorie en particulier? 💬"""

    if lang == "sw":
        return f"""Hapa kuna uchambuzi kamili wa fedha zako 💰

📊 Nambari Halisi:
• Mapato Leo: {_fmt_rwf(revenue_today)}
• Mapato ya Mwezi: {_fmt_rwf(revenue_month)}
• Jumla ya Gharama: {_fmt_rwf(expense_total)}
• Faida Halisi ya Mwezi: {_fmt_rwf(net_profit)}
• Asilimia ya Faida: {margin:.1f}%

Afya ya Fedha: {health} — {margin_note}

💸 Gharama kwa Kitengo:
{cat_lines()}

💡 Ushauri Wangu:
{"Fedha zako ziko vizuri — endelea kufuatilia na kuboresha!" if net_profit > 0 else "⚠️ Hasara ya mtaji mwezi huu. Ongeza mauzo au punguza gharama haraka."}
Kitengo kikubwa cha gharama kinahitaji ukaguzi wa kina.

Ungependa kuchunguza kitengo maalum? 💬"""

    return f"""Here's your complete financial picture 💰

📊 Real Numbers:
• Revenue Today: {_fmt_rwf(revenue_today)}
• Revenue This Month: {_fmt_rwf(revenue_month)}
• Total Recorded Expenses: {_fmt_rwf(expense_total)}
• Net Profit This Month: {_fmt_rwf(net_profit)}
• Profit Margin: {margin:.1f}%

Financial Health: {health} — {margin_note}

💸 Expenses by Category:
{cat_lines()}

💡 My take:
{"Good financial health — keep monitoring costs and look for savings opportunities!" if net_profit > 0 else "⚠️ You're running a net loss this month. Prioritize increasing sales volume or cutting your top expense."}
Your highest expense category is worth a deeper review.

Want to explore a specific area? I'm happy to dig in! 💬"""


def _build_sales(ctx: dict, lang: str) -> str:
    sales  = ctx.get("sales", {})
    stats  = sales.get("stats", {})
    recent = sales.get("recent_20", [])
    daily  = sales.get("daily_14_days", [])

    revenue_today = stats.get("revenue_today", stats.get("today_revenue", 0))
    sales_today   = stats.get("sales_today",   stats.get("today_count",   0))
    revenue_week  = stats.get("revenue_week",  stats.get("week_revenue",  0))

    def recent_lines():
        if not recent:
            return "  No transactions recorded yet"
        lines = []
        for s in recent[:8]:
            amt  = _fmt_rwf(s.get("total_amount", s.get("amount", s.get("total", 0))))
            date = str(s.get("date", s.get("created_at", "—")))[:10]
            lines.append(f"  🧾 {date} — {amt}")
        return "\n".join(lines)

    def daily_lines():
        if not daily or not isinstance(daily, list):
            return "  No daily data available yet"
        return "\n".join(
            f"  📅 {d.get('day','?')}: {_fmt_rwf(d.get('revenue',0))} ({d.get('sales_count',0)} sales)"
            for d in daily[-7:]
        )

    if lang == "rw":
        return f"""Reka nsesengure amagurishwa yawe 🛒

📊 Imibare y'Ukuri:
• Amagurishwa Uyu Munsi: {sales_today} y'amagurishwa
• Amafaranga Uyu Munsi: {_fmt_rwf(revenue_today)}
• Amafaranga y'Icyumweru: {_fmt_rwf(revenue_week)}

📅 Amagurishwa y'Iminsi 7 Ishize:
{daily_lines()}

🧾 Amagurishwa Ashya:
{recent_lines()}

💡 Inama Yanjye:
• Reba amasaha menshi amagurishwa akozwe ukore ko ibicuruzwa biriho
• Iminsi itagurishwa cyane reba impamvu — ni lishe cyangwa igihe gikomeye?
• Shishikariza abakiriya babonye ubu gusubira

Ushaka isesengura ryimbitse ry'amagurishwa? 💬"""

    if lang == "fr":
        return f"""Analysons vos ventes ensemble 🛒

📊 Chiffres Réels:
• Ventes Aujourd'hui: {sales_today} commandes
• Revenu Aujourd'hui: {_fmt_rwf(revenue_today)}
• Revenu Cette Semaine: {_fmt_rwf(revenue_week)}

📅 Performance des 7 Derniers Jours:
{daily_lines()}

🧾 Transactions Récentes:
{recent_lines()}

💡 Mon Conseil:
• Repérez vos heures de pointe et assurez-vous que le stock suit
• Les jours de faibles ventes méritent une enquête — météo, événement, stock?
• Fidélisez les clients récents avec des offres spéciales

Voulez-vous analyser un aspect particulier? 💬"""

    if lang == "sw":
        return f"""Hebu tuchambue mauzo yako 🛒

📊 Nambari Halisi:
• Mauzo Leo: {sales_today} maagizo
• Mapato Leo: {_fmt_rwf(revenue_today)}
• Mapato Wiki Hii: {_fmt_rwf(revenue_week)}

📅 Utendaji wa Siku 7 Zilizopita:
{daily_lines()}

🧾 Miamala ya Hivi Karibuni:
{recent_lines()}

💡 Ushauri Wangu:
• Tambua nyakati za kilele za mauzo na hakikisha bidhaa zipo
• Siku zenye mauzo ya chini — chunguza sababu (hali ya hewa, akiba, matukio)
• Wahimize wateja wa hivi karibuni kurudi kwa ofa maalum

Ungependa kuchunguza zaidi? 💬"""

    return f"""Let's look at your sales together 🛒

📊 Real Numbers:
• Sales Today: {sales_today} orders
• Revenue Today: {_fmt_rwf(revenue_today)}
• Revenue This Week: {_fmt_rwf(revenue_week)}

📅 Last 7 Days Performance:
{daily_lines()}

🧾 Recent Transactions:
{recent_lines()}

💡 What I notice:
• Identify your peak sales hours and make sure stock is always available then
• Low-sales days deserve investigation — weather, stock gaps, or seasonal patterns?
• Follow up with recent customers to encourage repeat visits

Want me to dig into something specific? 💬"""


def _build_growth(ctx: dict, lang: str) -> str:
    inventory = ctx.get("inventory", {})
    sales     = ctx.get("sales", {})
    stats     = sales.get("stats", {})
    top       = inventory.get("top_by_value", [])
    low       = inventory.get("low_stock_items", [])
    finances  = ctx.get("finances", {})

    revenue_month = stats.get("revenue_month", stats.get("month_revenue", 0))
    expense_total = finances.get("total_expenses_listed", 0)
    net_profit    = float(revenue_month) - float(expense_total)
    margin        = (net_profit / float(revenue_month) * 100) if float(revenue_month) > 0 else 0

    def top_lines():
        if not top:
            return "  Not enough data yet — keep recording sales!"
        return "\n".join(
            f"  🥇 #{i+1}: {p.get('name','?')} — {p.get('qty',0)} units @ {_fmt_rwf(p.get('price',0))}"
            for i, p in enumerate(top[:5])
        )

    tip1 = f"Restock {len(low)} low-stock items before you miss sales!" if low else "Stock levels look healthy — great foundation for growth!"
    tip2 = "Your margin is strong — consider investing profit back into more inventory." if margin > 20 else "Focus on cutting your biggest expense or nudging prices up slightly."

    if lang == "rw":
        return f"""Dore amahirwe yo gutera imbere! 📈

🏆 Ibicuruzwa Bifasha Cyane:
{top_lines()}

💰 Inyungu y'Ukwezi: {_fmt_rwf(net_profit)} ({margin:.1f}% igenga)

🚀 INAMA 3 INGAMBA:

1️⃣ {"Zuza ububiko bw'ibicuruzwa " + str(len(low)) + " bikenewe mbere y'uko birangira!" if low else "Ububiko ni mwanya — komeza gutanga ibicuruzwa byiza!"}

2️⃣ {"Igenga ryawe ni ryiza — shyira inyungu muri ububiko bwiyongere" if margin > 20 else "Tekereza kongera ibiciro by'ibicuruzwa byiza cyangwa menge amafaranga yaguriyemo."}

3️⃣ Teranya ibicuruzwa bigurwa buri gihe kugira ngo ibiciro bisabe buri gurishwa bibe byinshi.

Ese ushaka ko tugira inama ku bicuruzwa bihariye? 💬"""

    if lang == "fr":
        return f"""Voici vos opportunités de croissance! 📈

🏆 Vos Meilleurs Produits:
{top_lines()}

💰 Bénéfice du Mois: {_fmt_rwf(net_profit)} (marge {margin:.1f}%)

🚀 MES 3 RECOMMANDATIONS CLÉS:

1️⃣ {"Réapprovisionnez " + str(len(low)) + " article(s) en urgence pour ne pas manquer de ventes!" if low else "Stocks sains — excellente base pour la croissance!"}

2️⃣ {"Bonne marge — réinvestissez dans plus de stock de vos meilleurs produits!" if margin > 20 else "Envisagez d'augmenter légèrement les prix sur vos produits phares ou de réduire vos plus grosses dépenses."}

3️⃣ Créez des offres groupées avec vos articles populaires pour augmenter le panier moyen.

Voulez-vous des conseils sur un produit spécifique? 💬"""

    if lang == "sw":
        return f"""Hizi ndizo fursa zako za ukuaji! 📈

🏆 Bidhaa Bora Zaidi:
{top_lines()}

💰 Faida ya Mwezi: {_fmt_rwf(net_profit)} (asilimia {margin:.1f}%)

🚀 MAPENDEKEZO YANGU 3 MAKUU:

1️⃣ {"Jaza bidhaa " + str(len(low)) + " zinazokwisha kabla hazijaisha na kupoteza mauzo!" if low else "Akiba ziko sawa — msingi mzuri wa ukuaji!"}

2️⃣ {"Faida nzuri — wekeza tena faida kwenye akiba zaidi ya bidhaa bora!" if margin > 20 else "Fikiria kuongeza bei kidogo kwa bidhaa bora au kupunguza gharama kubwa zaidi."}

3️⃣ Unda vifurushi vya bidhaa maarufu ili kuongeza thamani ya kila manunuzi.

Ungependa ushauri kuhusu bidhaa maalum? 💬"""

    return f"""Here are your real growth opportunities! 📈

🏆 Your Top Performing Products:
{top_lines()}

💰 Monthly Profit: {_fmt_rwf(net_profit)} ({margin:.1f}% margin)

🚀 MY TOP 3 RECOMMENDATIONS:

1️⃣ {tip1}

2️⃣ {tip2}

3️⃣ Bundle your top-selling products together — it increases average order value without extra marketing spend.

Would you like specific advice on any product or area? I'm happy to go deeper! 💬"""


def _build_purchases(ctx: dict, lang: str) -> str:
    purchases = ctx.get("purchases", {}).get("recent", [])
    partners  = ctx.get("partners", {})
    suppliers = partners.get("total_suppliers", 0)

    def purchase_lines():
        if not purchases:
            return "  No recent purchases recorded yet"
        lines = []
        for p in purchases[:8]:
            amt  = _fmt_rwf(p.get("total_amount", p.get("amount", p.get("total", 0))))
            date = str(p.get("date", p.get("created_at", "—")))[:10]
            name = p.get("product_name", p.get("item_name", p.get("name", "—")))
            lines.append(f"  🚚 {date} — {name}: {amt}")
        return "\n".join(lines)

    if lang == "rw":
        return f"""Dore isesengura ry'ibigurwa byawe 🚚

📊 Abaganishi Bose: {suppliers}

🕐 Ibigurwa Bishya:
{purchase_lines()}

💡 Inama Yanjye:
• Kigereranye ibigurwa byagurijwe vuba n'ububiko bwawe bw'ubu
• Gura ibicuruzwa bikenewe mbere y'uko birangira — wirekera akaga
• Gerageza gutura amasezerano n'abaganishi beza kugira ngo ubike ibiciro byiza

Ushaka isesengura ryimbitse ry'ibigurwa? 💬"""

    if lang == "fr":
        return f"""Voici l'analyse de vos achats et fournisseurs 🚚

📊 Total Fournisseurs: {suppliers}

🕐 Achats Récents:
{purchase_lines()}

💡 Mon Conseil:
• Comparez vos achats récents avec vos niveaux de stock actuels
• Passez commande pour les articles bas avant la rupture — n'attendez pas!
• Négociez de meilleurs tarifs avec vos fournisseurs les plus utilisés

Vous voulez analyser vos achats en détail? 💬"""

    if lang == "sw":
        return f"""Hapa kuna uchambuzi wa manunuzi yako 🚚

📊 Jumla ya Wasambazaji: {suppliers}

🕐 Manunuzi ya Hivi Karibuni:
{purchase_lines()}

💡 Ushauri Wangu:
• Linganisha manunuzi ya hivi karibuni na viwango vya akiba yako sasa hivi
• Agiza bidhaa zinazokwisha kabla hazijaisha kabisa
• Jadiliana bei bora na wasambazaji wako wakuu

Ungependa uchambuzi wa kina wa manunuzi? 💬"""

    return f"""Here's your purchasing and supplier overview 🚚

📊 Total Suppliers: {suppliers}

🕐 Recent Purchases:
{purchase_lines()}

💡 My suggestions:
• Cross-check these purchases against your current stock levels
• Reorder low-stock items before they run out — don't wait for zero
• Negotiate better pricing with your most-used suppliers — even 5% off adds up

Want a deeper dive into purchasing patterns? 💬"""


def _build_full_report(ctx: dict, lang: str) -> str:
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    shop = ctx.get("shop", {}).get("name", "Your Shop")

    headers = {
        "en": f"📋 Complete Business Report — {shop}\n🕐 Generated: {now}",
        "rw": f"📋 Raporo Yuzuye y'Ubucuruzi — {shop}\n🕐 Yakozwe: {now}",
        "fr": f"📋 Rapport Complet de Commerce — {shop}\n🕐 Généré le: {now}",
        "sw": f"📋 Ripoti Kamili ya Biashara — {shop}\n🕐 Imetolewa: {now}",
    }
    dividers = {
        "en": "\n\n─────────────────────────────\n\n",
        "rw": "\n\n─────────────────────────────\n\n",
        "fr": "\n\n─────────────────────────────\n\n",
        "sw": "\n\n─────────────────────────────\n\n",
    }
    closers = {
        "en": "\n\nThat's your full picture! Let me know if you'd like to explore any section further. 💬",
        "rw": "\n\nIyo ni raporo yuzuye! Baza niba ushaka isesengura ryimbitse ry'icyiciro runaka. 💬",
        "fr": "\n\nVoilà votre tableau complet! N'hésitez pas à demander plus de détails. 💬",
        "sw": "\n\nHiyo ni picha yako kamili! Niulize ukitaka kuchunguza sehemu yoyote zaidi. 💬",
    }

    div = dividers.get(lang, dividers["en"])
    return (
        headers.get(lang, headers["en"])
        + div + _build_performance(ctx, lang)
        + div + _build_inventory(ctx, lang)
        + div + _build_financial(ctx, lang)
        + closers.get(lang, closers["en"])
    )


def _build_unknown(message: str, lang: str) -> str:
    short = message[:60] + ("…" if len(message) > 60 else "")
    if lang == "rw":
        return f"""Hmm, simeze neza neza: "{short}" 🤔

Ariko nshobora kukugezaho amakuru ku bijyanye n'ubucuruzi bwawe! Baza:

📊 "Iduka ryanjye rigenze bite uyu munsi?"
📦 "Ni ibicuruzwa bihe bikenewe kuzuzwa?"
💰 "Isesengura ry'imari yanjye?"
🛒 "Amagurishwa yanjye yo muri iki cyumweru?"
📈 "Inama zo kongera ubucuruzi?"
📋 "Mpore raporo yuzuye"
😊 Cyangwa baza "Muraho!" duganire!

Gerageza! 💬"""
    if lang == "fr":
        return f"""Hmm, je n'ai pas tout à fait compris: "{short}" 🤔

Je suis spécialisé dans les conseils commerciaux, mais essayez:

📊 "Comment va mon commerce aujourd'hui?"
📦 "Quels produits réapprovisionner?"
💰 "Analyse de mes finances"
🛒 "Mes ventes cette semaine?"
📈 "Comment croître?"
📋 "Génère un rapport complet"
😊 Ou dites juste "Salut!" pour papoter!

Posez-moi n'importe quelle question! 💬"""
    if lang == "sw":
        return f"""Hmm, sielewi vizuri: "{short}" 🤔

Mimi ni mtaalamu wa biashara, lakini jaribu:

📊 "Biashara yangu inakwenda vipi leo?"
📦 "Bidhaa zipi zinahitaji kujazwa?"
💰 "Uchambuzi wa fedha zangu"
🛒 "Mauzo ya wiki hii?"
📈 "Ninawezaje kukua?"
📋 "Tengeneza ripoti kamili"
😊 Au sema tu "Habari!" tuongee!

Niulize chochote! 💬"""
    return f"""Hmm, I'm not quite sure about: "{short}" 🤔

I'm best at business topics, but I can also just chat! Try:

📊 "How is my business doing today?"
📦 "Which products need restocking?"
💰 "Give me a financial overview"
🛒 "Show me my sales this week"
📈 "How can I grow my business?"
📋 "Generate a full business report"
😊 Or just say "Hi!" if you want to talk

What's on your mind? I'm here! 💬"""


# ── Public entry point ────────────────────────────────────────────────────────

def generate_reply(
    user_message: str,
    context: dict,
    language: str,
    history: list,
) -> tuple[str, int, int, float, int]:
    """
    Returns (reply_text, tokens_input, tokens_output, cost_usd, elapsed_ms).
    Standalone engine — tokens/cost always zero.
    """
    t0     = time.perf_counter()
    intent = _detect_intent(user_message)

    # Handlers that need the raw message text
    message_aware = {"smalltalk", "advice"}

    dispatch = {
        "greeting":       _build_greeting,
        "thanks":         _build_thanks,
        "help":           _build_help,
        "emotion_stress": _build_stress,
        "emotion_happy":  _build_happy,
        "smalltalk":      _build_smalltalk,
        "joke":           _build_joke,
        "advice":         _build_advice,
        "performance":    _build_performance,
        "inventory":      _build_inventory,
        "financial":      _build_financial,
        "sales":          _build_sales,
        "growth":         _build_growth,
        "purchases":      _build_purchases,
        "report":         _build_full_report,
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
