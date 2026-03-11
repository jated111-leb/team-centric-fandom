// Mock data for the 1001 World Cup Match Hub prototype

export const mockLineups = {
  teamA: {
    name: "العراق",
    flag: "🇮🇶",
    formation: "4-3-3",
    players: [
      "جلال حسن", "علي عدنان", "أحمد إبراهيم", "ريبين سولاقا", "ضرغام إسماعيل",
      "إبراهيم بايش", "أيمن حسين", "سعد عبد الأمير", "محند علي", "أمجد عطوان", "علاء عباس"
    ],
  },
  teamB: {
    name: "ألمانيا",
    flag: "🇩🇪",
    formation: "4-2-3-1",
    players: [
      "نوير", "كيميتش", "ريديغر", "تاه", "راوم",
      "أندريش", "فيرتز", "موسيالا", "ساني", "هافيرتز", "مولر"
    ],
  },
};

export const mockMatchFacts = {
  headToHead: { teamAWins: 12, draws: 8, teamBWins: 15 },
  form: {
    teamA: ["W", "W", "D", "L", "W"] as const,
    teamB: ["W", "L", "W", "W", "D"] as const,
  },
  stats: [
    { label: "مباريات سابقة", value: "35" },
    { label: "أهداف العراق", value: "38" },
    { label: "أهداف ألمانيا", value: "42" },
  ],
};

export const mockChatMessages = [
  { id: "1", username: "أبو حسين", message: "يلا عراق! 🇮🇶🔥", timestamp: "منذ 2 د" },
  { id: "2", username: "مشجع أسود", message: "التشكيلة قوية الليلة", timestamp: "منذ 1 د" },
  { id: "3", username: "نمر الرافدين", message: "إن شاء الله فوز", timestamp: "الآن" },
];

export const mockLiveChatMessages = [
  { id: "1", username: "أبو حسين", message: "هجمة خطيرة! 🔥", timestamp: "67'" },
  { id: "2", username: "مشجع أسود", message: "يا سلام على التمريرة", timestamp: "67'" },
  { id: "3", username: "نمر الرافدين", message: "هدددددف! ⚽🇮🇶", timestamp: "68'" },
  { id: "4", username: "ابن بغداد", message: "الله أكبر! ما شاء الله", timestamp: "68'" },
  { id: "5", username: "عاشق الكرة", message: "أيمن حسين أسطورة", timestamp: "68'" },
  { id: "6", username: "أسد الرافدين", message: "كملوا يا أبطال 💪", timestamp: "69'" },
];

export const mockMatchEvents = [
  { minute: "12'", type: "goal" as const, team: "A", player: "أيمن حسين", icon: "⚽" },
  { minute: "34'", type: "yellow" as const, team: "B", player: "موسيالا", icon: "🟨" },
  { minute: "45+2'", type: "goal" as const, team: "B", player: "هافيرتز", icon: "⚽" },
  { minute: "56'", type: "sub" as const, team: "A", player: "محند علي ⇄ أمجد عطوان", icon: "🔄" },
  { minute: "68'", type: "goal" as const, team: "A", player: "أيمن حسين", icon: "⚽" },
];

export const mockLeaderboard = [
  { rank: 1, username: "أسد الرافدين", points: 2450, isCurrentUser: false },
  { rank: 2, username: "ابن بغداد", points: 2380, isCurrentUser: false },
  { rank: 3, username: "نمر الرافدين", points: 2210, isCurrentUser: false },
  { rank: 4, username: "عاشق الكرة", points: 2150, isCurrentUser: false },
  { rank: 5, username: "أبو حسين", points: 2020, isCurrentUser: true },
  { rank: 6, username: "مشجع أسود", points: 1980, isCurrentUser: false },
  { rank: 7, username: "صقر العراق", points: 1870, isCurrentUser: false },
  { rank: 8, username: "ملك المدرجات", points: 1790, isCurrentUser: false },
  { rank: 9, username: "فارس بغداد", points: 1650, isCurrentUser: false },
  { rank: 10, username: "نجم الملاعب", points: 1580, isCurrentUser: false },
];

export const mockHighlights = [
  { id: "1", title: "هدف أيمن حسين - الأول", minute: "12'" },
  { id: "2", title: "تصدي العويس الخرافي", minute: "28'" },
  { id: "3", title: "هدف الشهري - التعادل", minute: "45+2'" },
  { id: "4", title: "هدف أيمن حسين - الثاني", minute: "68'" },
];

export const mockReactions = [
  { emoji: "⚽", label: "goal", count: 0 },
  { emoji: "🔥", label: "fire", count: 0 },
  { emoji: "😱", label: "shock", count: 0 },
  { emoji: "👏", label: "clap", count: 0 },
  { emoji: "🇮🇶", label: "iraq", count: 0 },
];

export const mockOriginals = [
  { id: "1", title: "وثائقي كأس آسيا", premium: true },
  { id: "2", title: "أبطال الرافدين", premium: true },
  { id: "3", title: "رحلة المونديال", premium: false },
  { id: "4", title: "نجوم العراق", premium: true },
  { id: "5", title: "ملاعب العالم", premium: false },
];

export const mockChannels = [
  { id: "1", name: "1001 Sport" },
  { id: "2", name: "TOD" },
  { id: "3", name: "beIN" },
  { id: "4", name: "SSC" },
  { id: "5", name: "MBC" },
];

export const mockPartnerLogos = [
  { id: "1", name: "STARZ PLAY", selected: false },
  { id: "2", name: "TOD", selected: true },
  { id: "3", name: "LaLiga", selected: false },
  { id: "4", name: "OSN+", selected: false },
  { id: "5", name: "shahid", selected: false },
  { id: "6", name: "beIN", selected: false },
];

export interface Quiz {
  id: string;
  phase: "pre" | "live";
  question: string;
  options: string[];
  correctIndex: number;
  points: number;
  triggerEvent?: "goal" | "yellow_card" | "halftime" | "var";
}

export const worldcupQuizzes: Quiz[] = [
  // ── PRE-GAME TRIVIA (football fan knowledge — easy / medium / hard) ──────────

  // Easy (10 pts)
  {
    id: "pre-1",
    phase: "pre",
    question: "من فاز بكأس العالم 2022 في قطر؟",
    options: ["فرنسا", "البرازيل", "الأرجنتين", "إنجلترا"],
    correctIndex: 2,
    points: 10,
  },
  {
    id: "pre-2",
    phase: "pre",
    question: "من فاز بجائزة الكرة الذهبية (أفضل لاعب) في كأس العالم 2022؟",
    options: ["كيليان مبابي", "ليونيل ميسي", "لوكا مودريتش", "نيمار"],
    correctIndex: 1,
    points: 10,
  },
  {
    id: "pre-3",
    phase: "pre",
    question: "في أي عام فاز المنتخب العراقي ببطولة كأس آسيا؟",
    options: ["1996", "2000", "2004", "2007"],
    correctIndex: 3,
    points: 10,
  },
  {
    id: "pre-4",
    phase: "pre",
    question: "في أي عام شارك العراق في كأس العالم لأول وآخر مرة قبل 2026؟",
    options: ["1974", "1982", "1986", "1990"],
    correctIndex: 2,
    points: 10,
  },

  // Medium (15 pts)
  {
    id: "pre-5",
    phase: "pre",
    question: "من فاز بالحذاء الذهبي (هداف البطولة) في كأس العالم 2018 بـ6 أهداف؟",
    options: ["رونالدو", "ميسي", "هاري كين", "كيليان مبابي"],
    correctIndex: 2,
    points: 15,
  },
  {
    id: "pre-6",
    phase: "pre",
    question: "أي منتخب كان بطل العالم لكنه خرج من دور المجموعات بصدمة كبرى في كأس العالم 2018؟",
    options: ["البرازيل", "إسبانيا", "ألمانيا", "إيطاليا"],
    correctIndex: 2,
    points: 15,
  },
  {
    id: "pre-7",
    phase: "pre",
    question: "أي دولة وصلت لنهائي كأس العالم 2018 لأول مرة في تاريخها؟",
    options: ["بلجيكا", "كرواتيا", "أوروغواي", "الدنمارك"],
    correctIndex: 1,
    points: 15,
  },
  {
    id: "pre-8",
    phase: "pre",
    question: "من سجّل هدف «يد الله» الأسطوري في كأس العالم 1986؟",
    options: ["رونالدو", "ميسي", "مارادونا", "زيدان"],
    correctIndex: 2,
    points: 15,
  },

  // Hard (20 pts)
  {
    id: "pre-9",
    phase: "pre",
    question: "كم هدفاً سجّل ميروسلاف كلوزه في بطولات كأس العالم — رقم قياسي تاريخي؟",
    options: ["12 هدفاً", "14 هدفاً", "16 هدفاً", "18 هدفاً"],
    correctIndex: 2,
    points: 20,
  },
  {
    id: "pre-10",
    phase: "pre",
    question: "ما لقب هزيمة البرازيل التاريخية 1-7 أمام ألمانيا على أرضها في نصف نهائي 2014؟",
    options: ["ماراكانازو", "مينيرازو", "ساو باولوازو", "ريو غرانديازو"],
    correctIndex: 1,
    points: 20,
  },

  // ── IN-GAME LIVE QUIZZES (real WC moments, event-triggered) ─────────────────

  // Goal triggered — medium/hard
  {
    id: "live-1",
    phase: "live",
    question: "من سجّل هاتريك في مباراة البرتغال وإسبانيا 3-3 في كأس العالم 2018؟ 🔥",
    options: ["دييغو كوستا", "كريستيانو رونالدو", "موراتا", "نيفيس"],
    correctIndex: 1,
    points: 20,
    triggerEvent: "goal",
  },
  {
    id: "live-2",
    phase: "live",
    question: "من كان هداف كأس العالم 2022 بـ8 أهداف وفاز بالحذاء الذهبي؟ ⚽",
    options: ["ميسي", "كيليان مبابي", "ماركوس راشفورد", "أوليفر جيرو"],
    correctIndex: 1,
    points: 20,
    triggerEvent: "goal",
  },
  {
    id: "live-3",
    phase: "live",
    question: "من سجّل الهدف الفائز لإسبانيا في نهائي كأس العالم 2010 أمام هولندا في الوقت الإضافي؟ 🏆",
    options: ["دافيد فيا", "أندريس إنييستا", "تشافي", "فيرناندو توريس"],
    correctIndex: 1,
    points: 25,
    triggerEvent: "goal",
  },

  // Yellow card triggered — easy/medium
  {
    id: "live-4",
    phase: "live",
    question: "أي نجم عالمي طُرد في نهائي كأس العالم 2006 بسبب ضربة الرأس الشهيرة على ماتيراتسي؟ 🟨",
    options: ["رونالدينيو", "رونالدو", "زين الدين زيدان", "ديفيد بيكهام"],
    correctIndex: 2,
    points: 15,
    triggerEvent: "yellow_card",
  },
  {
    id: "live-5",
    phase: "live",
    question: "أي منتخب عربي حقق مفاجأة كأس العالم 2022 بهزيمة الأرجنتين 2-1 في دور المجموعات؟ 🇸🇦",
    options: ["المغرب", "السعودية", "تونس", "الجزائر"],
    correctIndex: 1,
    points: 15,
    triggerEvent: "yellow_card",
  },

  // Halftime triggered — easy/medium
  {
    id: "live-6",
    phase: "live",
    question: "أي آلة موسيقية أصبحت رمز وصوت كأس العالم 2010 في جنوب أفريقيا؟ 🎶",
    options: ["الطبول الأفريقية", "الفوفوزيلا", "المزمار", "البوق"],
    correctIndex: 1,
    points: 10,
    triggerEvent: "halftime",
  },
  {
    id: "live-7",
    phase: "live",
    question: "أي منتخب عربي وصل لأبعد مرحلة في تاريخ العرب بكأس العالم 2022 (نصف النهائي)؟ 🌟",
    options: ["تونس", "السعودية", "المغرب", "مصر"],
    correctIndex: 2,
    points: 20,
    triggerEvent: "halftime",
  },

  // VAR triggered — easy/medium/hard
  {
    id: "live-8",
    phase: "live",
    question: "في أي نسخة من كأس العالم طُبّق نظام VAR رسمياً لأول مرة في التاريخ؟ 🖥️",
    options: ["2010 جنوب أفريقيا", "2014 البرازيل", "2018 روسيا", "2022 قطر"],
    correctIndex: 2,
    points: 15,
    triggerEvent: "var",
  },
  {
    id: "live-9",
    phase: "live",
    question: "في كأس العالم 2018، من سجّل أول ضربة جزاء في التاريخ مُمنوحة بقرار VAR؟ 🎯",
    options: ["كريستيانو رونالدو", "أنطوان غريزمان", "هاري كين", "كيليان مبابي"],
    correctIndex: 1,
    points: 20,
    triggerEvent: "var",
  },
  {
    id: "live-10",
    phase: "live",
    question: "من هو اللاعب الوحيد الذي فاز بكأس العالم ثلاث مرات مع نفس المنتخب (1958-1962-1970)؟ 🏆",
    options: ["رونالدو البرازيلي", "بيليه", "دييغو مارادونا", "فرانز بيكنباور"],
    correctIndex: 1,
    points: 25,
    triggerEvent: "var",
  },
];

export const mockRelatedContent = [
  { id: "1", title: "رحلة العراق نحو كأس العالم 2026", type: "وثائقي", duration: "45 د", premium: false },
  { id: "2", title: "أبطال الرافدين — قصص اللاعبين", type: "وثائقي", duration: "38 د", premium: true },
  { id: "3", title: "أفضل مباريات ألمانيا في كأس العالم", type: "مقاطع مختارة", duration: "22 د", premium: false },
  { id: "4", title: "تحليل تكتيكي: نقاط قوة العراق", type: "تحليل", duration: "18 د", premium: false },
  { id: "5", title: "ملاعب كأس العالم 2026 — جولة افتراضية", type: "وثائقي", duration: "30 د", premium: true },
];

export const mockFriendsList = [
  { id: "1", username: "أبو علي", online: true },
  { id: "2", username: "محمد الكاظمي", online: true },
  { id: "3", username: "أحمد بصرة", online: false },
  { id: "4", username: "فاطمة الزهراء", online: true },
  { id: "5", username: "سامر العراقي", online: false },
];
