// Mock data for the La Liga Match Hub (فدشي / Fedshi branded)

export interface LaLigaQuiz {
  id: string;
  phase: "pre" | "live";
  question: string;
  options: string[];
  correctIndex: number;
  points: number;
  triggerEvent?: "goal" | "yellow_card" | "halftime" | "var";
}

export const laligaQuizzes: LaLigaQuiz[] = [
  // ── PRE-GAME ──
  {
    id: "ll-pre-1",
    phase: "pre",
    question: "كم مرة فاز ريال مدريد بدوري أبطال أوروبا؟",
    options: ["10 مرات", "12 مرة", "15 مرة", "16 مرة"],
    correctIndex: 2,
    points: 10,
  },
  {
    id: "ll-pre-2",
    phase: "pre",
    question: "من هو الهداف التاريخي للدوري الإسباني؟",
    options: ["كريستيانو رونالدو", "ليونيل ميسي", "تيلمو زارا", "راؤول غونزاليس"],
    correctIndex: 1,
    points: 10,
  },
  {
    id: "ll-pre-3",
    phase: "pre",
    question: "في أي عام تأسس الدوري الإسباني (لا ليغا)؟",
    options: ["1920", "1929", "1936", "1945"],
    correctIndex: 1,
    points: 10,
  },
  {
    id: "ll-pre-4",
    phase: "pre",
    question: "أي نادٍ إسباني يحمل لقب «الغواصات الصفراء»؟",
    options: ["لاس بالماس", "قادش", "فياريال", "خيتافي"],
    correctIndex: 2,
    points: 15,
  },
  {
    id: "ll-pre-5",
    phase: "pre",
    question: "كم هدفاً سجّل ميسي في موسم 2011/12 القياسي مع برشلونة؟",
    options: ["50 هدفاً", "63 هدفاً", "73 هدفاً", "79 هدفاً"],
    correctIndex: 2,
    points: 15,
  },
  {
    id: "ll-pre-6",
    phase: "pre",
    question: "ما هو أكثر نادٍ فوزاً بلقب الدوري الإسباني تاريخياً؟",
    options: ["برشلونة", "ريال مدريد", "أتلتيكو مدريد", "أتلتيك بيلباو"],
    correctIndex: 1,
    points: 10,
  },
  {
    id: "ll-pre-7",
    phase: "pre",
    question: "من سجّل أسرع هدف في تاريخ الكلاسيكو؟",
    options: ["رونالدو", "ميسي", "راؤول", "سواريز"],
    correctIndex: 0,
    points: 20,
  },
  {
    id: "ll-pre-8",
    phase: "pre",
    question: "أي لاعب عربي لعب لريال مدريد في الدوري الإسباني؟",
    options: ["بدر هاري", "نور الدين أمرابط", "نبيل معلول", "لم يلعب أي عربي"],
    correctIndex: 3,
    points: 20,
  },

  // ── LIVE (event-triggered) ──
  {
    id: "ll-live-1",
    phase: "live",
    question: "من سجّل أكثر هاتريكات في تاريخ الكلاسيكو؟ ⚽",
    options: ["دي ستيفانو", "ميسي", "رونالدو", "بوشكاش"],
    correctIndex: 1,
    points: 20,
    triggerEvent: "goal",
  },
  {
    id: "ll-live-2",
    phase: "live",
    question: "كم هدفاً سجّل رونالدو في الكلاسيكو (جميع المسابقات)؟ 🔥",
    options: ["15", "18", "20", "22"],
    correctIndex: 1,
    points: 20,
    triggerEvent: "goal",
  },
  {
    id: "ll-live-3",
    phase: "live",
    question: "من حصل على أكثر بطاقات حمراء في تاريخ لا ليغا؟ 🟨",
    options: ["بيبي", "سيرجيو راموس", "خافي آلونسو", "جوفيتش"],
    correctIndex: 1,
    points: 15,
    triggerEvent: "yellow_card",
  },
  {
    id: "ll-live-4",
    phase: "live",
    question: "أي ملعب يتسع لأكبر عدد من المشجعين في إسبانيا؟ 🏟️",
    options: ["كامب نو", "سانتياغو برنابيو", "ملعب الكارتخينا", "واندا ميتروبوليتانو"],
    correctIndex: 1,
    points: 15,
    triggerEvent: "halftime",
  },
  {
    id: "ll-live-5",
    phase: "live",
    question: "في أي موسم فاز أتلتيكو مدريد بالدوري آخر مرة؟ ⚽",
    options: ["2019/20", "2020/21", "2021/22", "2022/23"],
    correctIndex: 1,
    points: 20,
    triggerEvent: "halftime",
  },
  {
    id: "ll-live-6",
    phase: "live",
    question: "من هو المدرب الأكثر فوزاً بالدوري الإسباني؟ 🖥️",
    options: ["غوارديولا", "زيدان", "ميغيل مونيوث", "ديل بوسكي"],
    correctIndex: 2,
    points: 25,
    triggerEvent: "var",
  },
];

// La Liga-themed chat usernames
export const LALIGA_CHAT_USERNAMES = [
  "مدريدي عتيق",
  "كوليه حتى النخاع",
  "عاشق الليغا",
  "الماتادور",
  "ابن البرنابيو",
  "نجم الكامب نو",
  "ملك الكلاسيكو",
  "سفير الليغا",
];

export const LALIGA_PRE_CHAT_MESSAGES = [
  { username: "مدريدي عتيق", message: "هلا مدريد 🤍" },
  { username: "كوليه حتى النخاع", message: "فورسا بارسا 💙❤️" },
  { username: "عاشق الليغا", message: "مباراة الليلة نارية 🔥" },
  { username: "الماتادور", message: "جاهزين لأقوى دوري في العالم 💪" },
  { username: "ابن البرنابيو", message: "الملكي ما يخسر أبداً 👑" },
  { username: "نجم الكامب نو", message: "يلا يا كوليه 🦁" },
];

export const LALIGA_LIVE_CHAT_MESSAGES = [
  { id: "1", username: "مدريدي عتيق", message: "هجمة خطيرة! 🔥", timestamp: "67'" },
  { id: "2", username: "كوليه حتى النخاع", message: "تمريرة ممتازة!", timestamp: "67'" },
  { id: "3", username: "عاشق الليغا", message: "هدددددف! ⚽", timestamp: "68'" },
  { id: "4", username: "الماتادور", message: "ما شاء الله على اللعب!", timestamp: "68'" },
  { id: "5", username: "ابن البرنابيو", message: "أداء رهيب 💪", timestamp: "69'" },
  { id: "6", username: "نجم الكامب نو", message: "كملوا على هالمستوى 🦁", timestamp: "69'" },
];

export const LALIGA_AUTO_MESSAGES = [
  { username: "مدريدي عتيق", message: "هلا مدريد 🤍" },
  { username: "كوليه حتى النخاع", message: "المباراة حماسية جداً 🔥" },
  { username: "عاشق الليغا", message: "أداء رائع من الفريقين 💪" },
  { username: "الماتادور", message: "نريد المزيد من الأهداف ⚽" },
  { username: "ابن البرنابيو", message: "الليغا أقوى دوري 👑" },
  { username: "نجم الكامب نو", message: "مباراة تاريخية 🏆" },
  { username: "ملك الكلاسيكو", message: "يا سلام على الكرة الإسبانية ⚡" },
  { username: "سفير الليغا", message: "ممتع جداً 🎉" },
];

export const LALIGA_MOCK_REACTIONS = [
  { emoji: "⚽", label: "goal", count: 0 },
  { emoji: "🔥", label: "fire", count: 0 },
  { emoji: "😱", label: "shock", count: 0 },
  { emoji: "👏", label: "clap", count: 0 },
  { emoji: "💪", label: "strong", count: 0 },
];

// Event config for La Liga (generic — team names injected at runtime)
export const LALIGA_EVENT_CONFIG = {
  goal: {
    emoji: "⚽",
    label: "هدف",
    bannerClass: "bg-green-700",
    floods: [
      { username: "عاشق الليغا", message: "هدددددف!! 🔥🔥" },
      { username: "الماتادور", message: "يا سلام!! 💪💪" },
      { username: "ابن البرنابيو", message: "أسطورة!! ❤️" },
      { username: "نجم الكامب نو", message: "يلا يلا يلا 🎉🎉🎉" },
    ],
  },
  yellow_card: {
    emoji: "🟨",
    label: "بطاقة",
    bannerClass: "bg-yellow-600",
    floods: [
      { username: "مدريدي عتيق", message: "استحقها 🟨😤" },
      { username: "عاشق الليغا", message: "الحكم شايف كل شي 👀" },
      { username: "الماتادور", message: "الضغط يبدأ الآن 💪" },
    ],
  },
  halftime: {
    emoji: "⏸️",
    label: "استراحة",
    bannerClass: "bg-blue-700",
    floods: [
      { username: "كوليه حتى النخاع", message: "شوط أول ممتاز! 👏" },
      { username: "ابن البرنابيو", message: "المدرب لازم يعدل التشكيلة 🤔" },
      { username: "عاشق الليغا", message: "إن شاء الله الشوط الثاني أفضل ⚽" },
    ],
  },
  var: {
    emoji: "🖥️",
    label: "VAR",
    bannerClass: "bg-purple-700",
    floods: [
      { username: "الماتادور", message: "وش يشوف بالـ VAR؟ 🖥️" },
      { username: "مدريدي عتيق", message: "يا ربي يثبّته هدف 🙏" },
      { username: "عاشق الليغا", message: "إذا ألغوه أرد الحكم 😂" },
    ],
  },
};
