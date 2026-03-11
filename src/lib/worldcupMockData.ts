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
    { label: "أهداف السعودية", value: "42" },
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
  { minute: "34'", type: "yellow" as const, team: "B", player: "محمد كنو", icon: "🟨" },
  { minute: "45+2'", type: "goal" as const, team: "B", player: "صالح الشهري", icon: "⚽" },
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
