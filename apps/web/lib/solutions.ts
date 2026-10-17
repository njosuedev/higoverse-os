// Public landing pages, one per thing people in Rwanda search for
// (app/solutions/[slug]). Every claim here must be true of the app today:
// no prices, no tax filing, no integrations it does not have.

export type Solution = {
  slug: string;
  /** Language of the page's words (the <html> stays "en"; the page wraps itself in this). */
  lang: "en" | "rw" | "fr";
  /** <title>, without " | Higoverse". */
  title: string;
  description: string;
  /** Short name used in links between pages. */
  name: string;
  h1: string;
  intro: string;
  /** Who the page is for, one line each. */
  forWho: string[];
  sections: { title: string; text: string; points?: string[] }[];
  faq: { q: string; a: string }[];
  /** Words used by the page's own buttons and headings. */
  ui?: Partial<typeof UI_EN>;
};

export const UI_EN = {
  whatsapp: "Chat on WhatsApp",
  whatsappMessage: "Hello Higoverse, I would like an account for my business.",
  call: "Call",
  forWho: "Made for",
  faq: "Questions",
  start: "Get started",
  startText: "Call or write to us. We set up your business and your sign-in, and help you add your products or vehicles.",
  more: "More from Higoverse",
  home: "Home",
  solutions: "Solutions",
  available: "On the web, Android and Windows · English, Kinyarwanda, French, Swahili and Chinese",
};

const ui = (s: Solution) => ({ ...UI_EN, ...s.ui });
export { ui as solutionUi };

export const SOLUTIONS: Solution[] = [
  {
    slug: "inventory-management-software-rwanda",
    lang: "en",
    title: "Inventory Management Software in Rwanda",
    name: "Inventory management",
    description:
      "Higoverse is inventory and stock management software for shops and businesses in Rwanda: live stock levels, low-stock alerts, supplier purchases, stock value and reports, on the web, Android and Windows.",
    h1: "Inventory management software for businesses in Rwanda",
    intro:
      "Know exactly what is on your shelves without counting by hand. Higoverse keeps every product with its price, cost and quantity, updates the stock by itself with every sale and every delivery, and warns you before you run out.",
    forWho: ["Retail and wholesale shops", "Hardware stores and spare parts dealers", "Supermarkets and boutiques", "Any business in Rwanda that buys and sells goods"],
    sections: [
      {
        title: "Stock that updates itself",
        text: "Each sale takes the goods out of stock, and each purchase from a supplier adds them back with what they cost you. The quantity you see is always the quantity you have.",
        points: [
          "Live quantity for every product, the same on every device",
          "Low and empty stock shown first, with one click to restock",
          "Every delivery keeps its own cost, so margins stay correct",
          "Find a product by name or by scanning its barcode with the phone camera",
        ],
      },
      {
        title: "Start in an afternoon",
        text: "Download the Excel template, fill in the products you already have, and import the file. Photos, selling prices, buying prices and margins can be added for every product, and lists can be exported to Excel at any time.",
      },
      {
        title: "See what your stock is worth",
        text: "Reports show the value of your stock, your best sellers, and revenue, expenses and profit day by day and month by month, so you know what to order and what is not moving.",
      },
      {
        title: "Your team, with the right access",
        text: "Employees get their own sign-in and see only what their role allows. Owners get notified of sales and low stock as they happen.",
      },
    ],
    faq: [
      { q: "What is the best inventory management software in Rwanda?", a: "Higoverse was built in Kigali for businesses in Rwanda. It tracks stock, sales, purchases, expenses and customer debts in one account, works in Kinyarwanda, English and French, and runs on the web, Android and Windows." },
      { q: "Can I import my existing products?", a: "Yes. Fill in the Excel template with your products and import it. You can export your lists to Excel at any time too." },
      { q: "Does Higoverse warn me when stock is low?", a: "Yes. Products running low or out of stock are listed first and you are notified, so you can restock from your supplier in one step." },
      { q: "Can I use it on my phone?", a: "Yes. Use the Android app, the Windows app or the website. All of them show the same stock, updated live." },
    ],
  },
  {
    slug: "pos-sales-software-rwanda",
    lang: "en",
    title: "Sales and Point of Sale (POS) Software in Rwanda",
    name: "Sales and point of sale",
    description:
      "Record sales in seconds with Higoverse, the sales and point of sale software for shops in Rwanda: cash or credit, balances due, daily sales, best sellers and profit, on your phone or computer.",
    h1: "Sales and point of sale software for shops in Rwanda",
    intro:
      "Record a sale in seconds from your phone or your computer, paid in full or with a balance due. Higoverse takes the goods out of stock, keeps the customer's debt if they pay later, and shows what sold today.",
    forWho: ["Shops and boutiques", "Wholesalers selling on credit", "Car dealers taking deposits", "Businesses with several people selling"],
    sections: [
      {
        title: "Fast sales, on any device",
        text: "Sell from the Android app, the Windows app or the website. Find products by name or barcode, and the stock goes down by itself.",
        points: [
          "Paid in full or with a balance due",
          "Today's sales, expenses and profit at a glance",
          "Notifications for the owner as sales come in",
        ],
      },
      {
        title: "Sales on credit, followed to the last franc",
        text: "When a customer pays part now and the rest later, the balance becomes a customer debt with their phone number. Each payment is recorded as it comes in until the debt is cleared.",
      },
      {
        title: "Proforma first, sale later",
        text: "Send a proforma invoice with your logo and bank details. When the customer buys, turn it into a sale without typing it again.",
      },
      {
        title: "Reports that answer the real questions",
        text: "Revenue, expenses, profit and best sellers, day by day and month by month, so you can see how the business is doing without a spreadsheet.",
      },
    ],
    faq: [
      { q: "Is Higoverse a POS system?", a: "Higoverse records sales at the counter or anywhere else, on a phone, a computer or a browser, and keeps stock, customer debts and reports up to date with each sale. It is a full business management platform, not only a till." },
      { q: "Can customers pay later?", a: "Yes. Record the sale with a balance due and Higoverse follows it as a customer debt until it is paid." },
      { q: "Can my employees record sales?", a: "Yes. Each employee has their own sign-in and sees only what their role allows." },
      { q: "Does it work in Kinyarwanda?", a: "Yes. Higoverse works in Kinyarwanda, English, French, Swahili and Chinese, and each person picks their own language." },
    ],
  },
  {
    slug: "car-dealer-software-rwanda",
    lang: "en",
    title: "Car Dealer Management Software in Rwanda",
    name: "Car dealers",
    description:
      "Higoverse is car dealer management software for Rwanda: every vehicle by chassis and plate number, deposits and balances, traffic fines, vehicle proformas and a WhatsApp catalogue of the cars you have in stock.",
    h1: "Car dealer management software in Rwanda",
    intro:
      "Every car is one vehicle, followed from the day it arrives to the day it is transferred to its buyer. Higoverse keeps the chassis and plate number, the buyer's deposits and balance, and any traffic fines with the car.",
    forWho: ["Car dealers and showrooms", "Electric vehicle importers", "Motorcycle dealers", "Dealers selling with deposits and balances"],
    sections: [
      {
        title: "Each vehicle by chassis and plate",
        text: "Stock in many cars at once, for example ten of one model and twenty of another, then give each one its own chassis and plate number.",
        points: [
          "Cars grouped by name, with what is available, pending transfer or sold",
          "Deposits and balances for each buyer",
          "Traffic fines kept with the car until it is transferred",
          "Staff don't see costs or profit; the owner sees everything",
        ],
      },
      {
        title: "Vehicle proformas, ready to print",
        text: "Clean A4 proformas with the chassis, the plate, your logo and your bank account, approved by the owner and turned into a sale when the customer buys.",
      },
      {
        title: "A catalogue for WhatsApp",
        text: "Share the cars you have in stock as WhatsApp Status cards, pictures or a link to a catalogue page, with or without prices, in the customer's language.",
      },
    ],
    faq: [
      { q: "Can Higoverse track each car separately?", a: "Yes. Every vehicle has its own chassis and plate number and its own status: available, pending transfer or sold." },
      { q: "Can buyers pay a deposit?", a: "Yes. Record the deposit and Higoverse follows the balance until the car is fully paid." },
      { q: "Can my sales staff see my margins?", a: "No. At car dealers, staff don't see costs or profit. The owner sees everything." },
      { q: "Can I share my stock with customers?", a: "Yes. Share a catalogue of the cars you have as WhatsApp Status cards, pictures or a link." },
    ],
  },
  {
    slug: "proforma-invoice-software-rwanda",
    lang: "en",
    title: "Proforma Invoice Software in Rwanda",
    name: "Proforma invoices",
    description:
      "Make clean A4 proforma invoices in Rwanda with Higoverse: your logo and bank details, approval by the owner, and one step to turn the proforma into a sale when the customer buys.",
    h1: "Proforma invoice software for businesses in Rwanda",
    intro:
      "Customers, companies and institutions in Rwanda ask for a proforma before they buy. Higoverse makes a clean A4 proforma with your logo and bank details from the products you already have, and turns it into a sale when the customer pays.",
    forWho: ["Suppliers to companies and institutions", "Car dealers", "Hardware and equipment shops", "Any business asked for a quotation"],
    sections: [
      {
        title: "From your products, in a minute",
        text: "Choose the products or vehicles and the quantities; prices come from your stock. The proforma carries your logo, your contacts and your bank account.",
        points: ["A4, ready to print", "Approved by the owner before it is sent", "Vehicle proformas with chassis and plate", "Turned into a sale in one step"],
      },
      {
        title: "Nothing typed twice",
        text: "When the customer buys, the proforma becomes the sale: stock goes down, the balance due becomes a customer debt, and the reports include it.",
      },
    ],
    faq: [
      { q: "Can I put my logo and bank account on the proforma?", a: "Yes. Every proforma carries your business logo, contacts and bank details." },
      { q: "Can a proforma become a sale?", a: "Yes. When the customer buys, turn it into a sale in one step; stock and reports update by themselves." },
      { q: "Who can approve a proforma?", a: "The owner approves proformas before they are sent, so prices stay under control." },
    ],
  },
  {
    slug: "customer-debt-tracking-rwanda",
    lang: "en",
    title: "Customer Debt Tracking App in Rwanda",
    name: "Customer debts",
    description:
      "Track who owes you money with Higoverse: sales on credit, each payment as it comes in, the customer's phone number at hand, and the total owed to your business in Rwanda.",
    h1: "Track customer debts and sales on credit",
    intro:
      "Selling on credit is normal in Rwanda; forgetting who owes what is expensive. Higoverse turns every unpaid balance into a customer debt with the customer's phone number, and records each payment until it is cleared.",
    forWho: ["Shops that sell on credit", "Wholesalers with regular customers", "Car dealers taking deposits", "Businesses replacing a debt notebook"],
    sections: [
      {
        title: "Every debt from the sale itself",
        text: "Record a sale with a balance due and the debt is created by itself, linked to the customer and the goods sold.",
        points: ["Who owes what, and since when", "Each payment as it comes in", "The customer's phone number one tap away", "The total owed to the business"],
      },
      {
        title: "No more notebook",
        text: "The same list on the owner's phone, the shop computer and the website, so a payment recorded by one person is seen by everyone.",
      },
    ],
    faq: [
      { q: "Can I record part payments?", a: "Yes. Each payment is recorded as it comes in, and the remaining balance updates by itself." },
      { q: "Can I call the customer from the app?", a: "Yes. The customer's phone number is shown with the debt, one tap away on a phone." },
    ],
  },
  {
    slug: "payroll-software-rwanda",
    lang: "en",
    title: "Payroll Software for Small Businesses in Rwanda",
    name: "Payroll",
    description:
      "Pay monthly salaries with Higoverse: employees, deductions such as advances, payment by cash, MTN MoMo, Airtel Money or bank transfer, pay slips and a payroll sheet, for small businesses in Rwanda.",
    h1: "Payroll for small businesses in Rwanda",
    intro:
      "Keep your employees, their monthly salaries and every payment in the same place as the rest of your business. Each salary paid is recorded as an expense, so your profit is always right.",
    forWho: ["Shops with staff on a monthly salary", "Car dealers", "Small companies paying by MoMo or bank"],
    sections: [
      {
        title: "Each month's salaries",
        text: "See who is paid and who is still to pay, record deductions such as advances with their reason, and mark each salary paid.",
        points: ["Cash, MTN MoMo, Airtel Money or bank transfer", "Pay slips and a payroll sheet to print", "A payment confirmation each employee signs", "Salaries counted in your expenses and profit"],
      },
    ],
    faq: [
      { q: "Does Higoverse calculate PAYE and RSSB?", a: "No. Higoverse records salaries, deductions and payments and prints pay slips; tax and social security amounts are entered as deductions by you or your accountant." },
      { q: "Can I pay salaries with mobile money?", a: "You can record each salary as paid by cash, MTN MoMo, Airtel Money or bank transfer. The money itself is sent from your usual account." },
    ],
  },
  {
    slug: "porogaramu-yo-gucunga-ubucuruzi",
    lang: "rw",
    title: "Porogaramu yo gucunga ubucuruzi n'ububiko mu Rwanda",
    name: "Mu Kinyarwanda",
    description:
      "Higoverse ni porogaramu yo gucunga ubucuruzi mu Rwanda: ububiko (stock), amagurishwa, ibyaguzwe, amafaranga yakoreshejwe, amadeni y'abakiriya, proforma n'imishahara, kuri telefoni, mudasobwa n'urubuga.",
    h1: "Porogaramu yo gucunga ubucuruzi bwawe mu Rwanda",
    intro:
      "Higoverse yandika ububiko bwawe, amagurishwa, ibyo uguze, amafaranga ukoresha, amadeni y'abakiriya, proforma n'imishahara, ikakwereka uko ubucuruzi bwifashe. Ikora mu Kinyarwanda, kuri Android, Windows no ku rubuga.",
    forWho: ["Amaduka n'ababika ibicuruzwa byinshi", "Abacuruza imodoka", "Amaduka y'ibikoresho by'ubwubatsi", "Ubucuruzi bwose bugura bukanagurisha"],
    sections: [
      {
        title: "Ububiko (stock) bwihindura ubwabwo",
        text: "Buri gicuruzwa kigurishijwe kivanwa mu bubiko, buri kiguzwe ku mucuruzi kikongerwamo. Ubona ibisigaye n'ibigiye gushira mbere y'uko bishira.",
        points: ["Ibisigaye kuri buri gicuruzwa, ako kanya", "Ibigiye gushira bigaragara mbere", "Kwinjiza ibicuruzwa ukoresheje Excel", "Gushaka igicuruzwa ukoresheje barcode"],
      },
      {
        title: "Amagurishwa n'amadeni",
        text: "Andika igurisha mu masegonda, ryishyuwe ryose cyangwa hasigaye umwenda. Umwenda uba ideni ry'umukiriya kugeza ryishyuwe, rifite nimero ya telefoni ye.",
      },
      {
        title: "Raporo n'abakozi",
        text: "Reba amafaranga yinjiye, ayakoreshejwe n'inyungu buri munsi na buri kwezi. Abakozi bagira konti zabo, buri wese akabona gusa ibyo yemerewe.",
      },
    ],
    faq: [
      { q: "Higoverse ikora mu Kinyarwanda?", a: "Yego. Ikora mu Kinyarwanda, Icyongereza, Igifaransa, Igiswahili n'Igishinwa. Buri muntu ahitamo ururimi rwe." },
      { q: "Nabona konti nte?", a: "Duhamagare cyangwa utwandikire kuri WhatsApp kuri 0790 885 174. Dushyiraho ubucuruzi bwawe n'uburyo bwo kwinjira." },
      { q: "Ikora kuri telefoni?", a: "Yego. Koresha porogaramu ya Android, iya Windows cyangwa urubuga. Amakuru ni amwe hose." },
    ],
    ui: {
      whatsapp: "Twandikire kuri WhatsApp",
      whatsappMessage: "Muraho Higoverse, nifuza konti y'ubucuruzi bwanjye.",
      call: "Hamagara",
      forWho: "Ni iy'",
      faq: "Ibibazo",
      start: "Tangira",
      startText: "Duhamagare cyangwa utwandikire. Dushyiraho ubucuruzi bwawe n'uburyo bwo kwinjira, tukagufasha kwinjiza ibicuruzwa byawe.",
      more: "Ibindi kuri Higoverse",
      home: "Ahabanza",
      solutions: "Ibisubizo",
      available: "Ku rubuga, Android na Windows · Ikinyarwanda, Icyongereza, Igifaransa, Igiswahili n'Igishinwa",
    },
  },
  {
    slug: "logiciel-de-gestion-commerciale-rwanda",
    lang: "fr",
    title: "Logiciel de gestion commerciale et de stock au Rwanda",
    name: "En français",
    description:
      "Higoverse est le logiciel de gestion commerciale pour les boutiques et concessionnaires au Rwanda : stock, ventes, achats, dépenses, dettes clients, factures proforma, salaires et rapports, sur le web, Android et Windows.",
    h1: "Logiciel de gestion commerciale au Rwanda",
    intro:
      "Higoverse enregistre votre stock, vos ventes, vos achats, vos dépenses, les dettes de vos clients, vos factures proforma et vos salaires, et vous montre comment se porte votre entreprise : sur le web, sur Android et sur Windows.",
    forWho: ["Boutiques et commerces de gros", "Concessionnaires automobiles", "Quincailleries et pièces détachées", "Toute entreprise qui achète et revend"],
    sections: [
      {
        title: "Gestion de stock en temps réel",
        text: "Chaque vente sort la marchandise du stock, chaque achat fournisseur l'y remet avec son coût. Les ruptures sont signalées avant qu'elles arrivent.",
        points: ["Quantités en direct sur tous les appareils", "Import de vos produits depuis Excel", "Recherche par nom ou code-barres", "Valeur du stock et meilleures ventes"],
      },
      {
        title: "Ventes, crédits et proformas",
        text: "Enregistrez une vente payée ou avec un solde dû ; le solde devient une dette client suivie jusqu'au dernier paiement. Les proformas A4 portent votre logo et vos coordonnées bancaires et deviennent une vente en un clic.",
      },
      {
        title: "Concessionnaires automobiles",
        text: "Chaque véhicule suivi par numéro de châssis et plaque, avec acomptes, soldes, amendes et un catalogue à partager sur WhatsApp.",
      },
    ],
    faq: [
      { q: "Higoverse est-il disponible en français ?", a: "Oui. Higoverse fonctionne en français, anglais, kinyarwanda, swahili et chinois ; chacun choisit sa langue." },
      { q: "Comment obtenir un compte ?", a: "Appelez-nous ou écrivez-nous sur WhatsApp au +250 790 885 174. Nous créons votre entreprise et vos accès." },
    ],
    ui: {
      whatsapp: "Discuter sur WhatsApp",
      whatsappMessage: "Bonjour Higoverse, je voudrais un compte pour mon entreprise.",
      call: "Appeler",
      forWho: "Pour",
      faq: "Questions",
      start: "Commencer",
      startText: "Appelez-nous ou écrivez-nous. Nous créons votre entreprise et vos accès, et vous aidons à ajouter vos produits ou véhicules.",
      more: "Plus sur Higoverse",
      home: "Accueil",
      solutions: "Solutions",
      available: "Sur le web, Android et Windows · Anglais, kinyarwanda, français, swahili et chinois",
    },
  },
];

export const solutionBySlug = (slug: string) => SOLUTIONS.find((s) => s.slug === slug);
