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
  // ── PRE-GAME TRIVIA ─────────────────────────────────────────────────────────
  {
    id: "pre-1",
    phase: "pre",
    question: "من هي الدول المستضيفة لكأس العالم 2026؟",
    options: ["أمريكا فقط", "أمريكا والمكسيك وكندا", "كندا والمكسيك فقط", "أمريكا والبرازيل"],
    correctIndex: 1,
    points: 10,
  },
  {
    id: "pre-2",
    phase: "pre",
    question: "كم فريقاً سيشارك في كأس العالم 2026؟",
    options: ["32 فريقاً", "40 فريقاً", "48 فريقاً", "64 فريقاً"],
    correctIndex: 2,
    points: 10,
  },
  {
    id: "pre-3",
    phase: "pre",
    question: "في أي ملعب سيُقام نهائي كأس العالم 2026؟",
    options: ["ملعب أزتيكا", "ملعب SoFi", "ملعب ميتلايف", "ملعب روز بول"],
    correctIndex: 2,
    points: 15,
  },
  {
    id: "pre-4",
    phase: "pre",
    question: "كم مباراة ستُلعب في نسخة 2026 إجمالاً؟",
    options: ["64 مباراة", "80 مباراة", "96 مباراة", "104 مباريات"],
    correctIndex: 3,
    points: 20,
  },
  {
    id: "pre-5",
    phase: "pre",
    question: "في أي عام شارك العراق في كأس العالم لأول وآخر مرة قبل 2026؟",
    options: ["1974", "1982", "1986", "1990"],
    correctIndex: 2,
    points: 15,
  },
  {
    id: "pre-6",
    phase: "pre",
    question: "في أي عام فاز المنتخب العراقي ببطولة كأس آسيا؟",
    options: ["1996", "2000", "2004", "2007"],
    correctIndex: 3,
    points: 10,
  },
  {
    id: "pre-7",
    phase: "pre",
    question: "أي منتخب فاز بأكبر عدد من كؤوس العالم؟",
    options: ["ألمانيا", "إيطاليا", "البرازيل", "الأرجنتين"],
    correctIndex: 2,
    points: 10,
  },
  {
    id: "pre-8",
    phase: "pre",
    question: "كم مجموعة ستكون في كأس العالم 2026؟",
    options: ["8 مجموعات", "10 مجموعات", "12 مجموعة", "16 مجموعة"],
    correctIndex: 2,
    points: 15,
  },
  {
    id: "pre-9",
    phase: "pre",
    question: "من هو الهداف التاريخي لكأس العالم من حيث عدد الأهداف؟",
    options: ["رونالدو", "ميسي", "مولر", "كلوزه"],
    correctIndex: 3,
    points: 20,
  },
  {
    id: "pre-10",
    phase: "pre",
    question: "ما هي نتيجة أكبر فوز في تاريخ كأس العالم؟",
    options: ["7-0", "8-1", "9-0", "10-1"],
    correctIndex: 3,
    points: 20,
  },
  // ── IN-GAME LIVE QUIZZES ────────────────────────────────────────────────────
  {
    id: "live-1",
    phase: "live",
    question: "من سجّل هذا الهدف؟ ⚽",
    options: ["أيمن حسين", "علاء عباس", "محند علي", "سعد عبد الأمير"],
    correctIndex: 0,
    points: 20,
    triggerEvent: "goal",
  },
  {
    id: "live-2",
    phase: "live",
    question: "من أعطى التمريرة الحاسمة للهدف؟",
    options: ["ضرغام إسماعيل", "إبراهيم بايش", "علاء عباس", "أمجد عطوان"],
    correctIndex: 2,
    points: 15,
    triggerEvent: "goal",
  },
  {
    id: "live-3",
    phase: "live",
    question: "من سيكون رجل المباراة بهذا الأداء؟",
    options: ["أيمن حسين", "جلال حسن", "علاء عباس", "ريبين سولاقا"],
    correctIndex: 0,
    points: 25,
    triggerEvent: "goal",
  },
  {
    id: "live-4",
    phase: "live",
    question: "كم بطاقة صفراء تؤدي إلى الإيقاف في كأس العالم؟",
    options: ["1 بطاقة", "2 بطاقة", "3 بطاقات", "4 بطاقات"],
    correctIndex: 1,
    points: 15,
    triggerEvent: "yellow_card",
  },
  {
    id: "live-5",
    phase: "live",
    question: "ماذا يحدث عند حصول اللاعب على بطاقتين صفراوتين؟",
    options: ["غرامة مالية", "طرد من الملعب", "حرمان من مباراة واحدة", "تحذير فقط"],
    correctIndex: 1,
    points: 10,
    triggerEvent: "yellow_card",
  },
  {
    id: "live-6",
    phase: "live",
    question: "كم دقيقة يستمر كل شوط إضافي في كأس العالم؟",
    options: ["10 دقائق", "15 دقيقة", "20 دقيقة", "30 دقيقة"],
    correctIndex: 1,
    points: 20,
    triggerEvent: "halftime",
  },
  {
    id: "live-7",
    phase: "live",
    question: "من كان أفضل لاعب في الشوط الأول؟",
    options: ["أيمن حسين", "علاء عباس", "أمجد عطوان", "محند علي"],
    correctIndex: 0,
    points: 10,
    triggerEvent: "halftime",
  },
  {
    id: "live-8",
    phase: "live",
    question: "ماذا تعني اختصار VAR؟",
    options: ["تقنية مراجعة الفيديو", "مساعد حكم الفيديو", "مراجعة الأداء بالفيديو", "نظام مساعدة بالفيديو"],
    correctIndex: 1,
    points: 15,
    triggerEvent: "var",
  },
  {
    id: "live-9",
    phase: "live",
    question: "في أي كأس عالم استُخدم VAR لأول مرة رسمياً؟",
    options: ["2010", "2014", "2018", "2022"],
    correctIndex: 2,
    points: 20,
    triggerEvent: "var",
  },
  {
    id: "live-10",
    phase: "live",
    question: "ما هو القرار المتوقع بعد مراجعة VAR؟",
    options: ["هدف صحيح ✅", "تسلل ❌", "ضربة جزاء ⚽", "ركلة حرة مباشرة"],
    correctIndex: 0,
    points: 15,
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
