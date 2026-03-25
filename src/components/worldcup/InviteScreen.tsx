import { useState } from "react";
import { ArrowRight, Copy, Check, Gift, Users, Trophy, Zap } from "lucide-react";

interface InviteScreenProps {
  onBack: () => void;
  username?: string | null;
}

const SHARE_URL = "https://team-centric-fandom.lovable.app/world-cup";

const InviteScreen = ({ onBack, username }: InviteScreenProps) => {
  const [copied, setCopied] = useState(false);
  const [invitesSent, setInvitesSent] = useState(0);

  const shareText = `🇮🇶⚽🇩🇪 العراق ضد ألمانيا — المباراة مباشرة الآن!\nادخل وتحدّاني على 1001 👇\n${SHARE_URL}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(SHARE_URL);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleWhatsAppShare = () => {
    setInvitesSent((c) => c + 1);
    window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, "_blank");
  };

  const handleTelegramShare = () => {
    setInvitesSent((c) => c + 1);
    window.open(`https://t.me/share/url?url=${encodeURIComponent(SHARE_URL)}&text=${encodeURIComponent(shareText)}`, "_blank");
  };

  const handleTwitterShare = () => {
    setInvitesSent((c) => c + 1);
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`, "_blank");
  };

  return (
    <div className="flex-1 overflow-y-auto bg-wc-bg">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-wc-border">
        <button onClick={onBack}>
          <ArrowRight size={20} className="text-wc-text" />
        </button>
        <span className="text-wc-text font-bold text-sm">ادعُ أصدقاءك</span>
        <div className="w-5" />
      </div>

      {/* Hero */}
      <div className="px-6 pt-8 pb-6 text-center">
        <div
          className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center mb-4"
          style={{ background: "linear-gradient(135deg, hsl(var(--wc-accent)), hsl(var(--wc-warning)))" }}
        >
          <Gift size={28} className="text-white" />
        </div>
        <h1 className="text-wc-text font-bold text-xl mb-2 leading-tight">
          المباراة أحلى مع الربع
        </h1>
        <p className="text-wc-muted text-xs leading-relaxed max-w-[280px] mx-auto">
          ادعُ أصدقاءك للمشاهدة والتفاعل — كل واحد ينضم يحصل على نقاط إضافية
        </p>
      </div>

      {/* Points Boost Card */}
      <div className="mx-4 mb-4 rounded-2xl p-4 bg-wc-surface border border-wc-accent/30">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-wc-accent/15 flex items-center justify-center">
            <Zap size={18} className="text-wc-accent" />
          </div>
          <div className="flex-1 text-right">
            <p className="text-wc-text font-bold text-sm">+50 نقطة لكل دعوة</p>
            <p className="text-wc-muted text-[10px]">أنت وصديقك تحصلون على المكافأة</p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-xl bg-wc-elevated p-2.5">
          <div className="flex-1 text-right">
            <span className="text-wc-warning font-bold text-lg font-mono">{invitesSent * 50}</span>
            <span className="text-wc-muted text-[10px] mr-1.5">نقطة مكتسبة من الدعوات</span>
          </div>
          <span className="text-xs text-wc-muted bg-wc-surface px-2 py-1 rounded-full border border-wc-border">
            {invitesSent} دعوة
          </span>
        </div>
      </div>

      {/* Why Invite Section */}
      <div className="mx-4 mb-4 space-y-2">
        {[
          {
            icon: <Users size={16} className="text-wc-accent" />,
            title: "ليدربورد خاص",
            desc: "نافس أصدقاءك مباشرة — مين يعرف أكثر؟",
          },
          {
            icon: <Trophy size={16} className="text-wc-warning" />,
            title: "تحديات جماعية",
            desc: "اختبارات وتوقعات تنلعب أحلى مع الربع",
          },
          {
            icon: <Zap size={16} className="text-wc-accent" />,
            title: "الحماس يتضاعف",
            desc: "الدردشة مع أصدقاء حقيقيين ترفع الأجواء",
          },
        ].map((item, i) => (
          <div
            key={i}
            className="flex items-center gap-3 px-4 py-3 rounded-xl bg-wc-surface border border-wc-border"
          >
            <div className="w-8 h-8 rounded-lg bg-wc-elevated flex items-center justify-center flex-shrink-0">
              {item.icon}
            </div>
            <div className="flex-1 text-right">
              <p className="text-wc-text text-xs font-bold">{item.title}</p>
              <p className="text-wc-muted text-[10px]">{item.desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Share Actions */}
      <div className="mx-4 mb-4">
        <p className="text-wc-muted text-[10px] mb-2 text-center">شارك الدعوة عبر</p>
        <div className="space-y-2">
          {/* WhatsApp — primary */}
          <button
            onClick={handleWhatsAppShare}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm text-white"
            style={{ background: "#25D366" }}
          >
            <span className="text-lg">💬</span>
            <span>واتساب</span>
          </button>

          {/* Secondary row */}
          <div className="flex gap-2">
            <button
              onClick={handleTelegramShare}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-medium bg-wc-elevated border border-wc-border text-wc-text"
            >
              <span>✈️</span>
              <span>تلغرام</span>
            </button>
            <button
              onClick={handleTwitterShare}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-medium bg-wc-elevated border border-wc-border text-wc-text"
            >
              <span>𝕏</span>
              <span>تويتر</span>
            </button>
            <button
              onClick={handleCopyLink}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-medium bg-wc-elevated border border-wc-border text-wc-text"
            >
              {copied ? <Check size={14} className="text-wc-accent" /> : <Copy size={14} />}
              <span>{copied ? "تم!" : "نسخ"}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Social Proof */}
      <div className="mx-4 mb-6 text-center">
        <p className="text-[10px] text-wc-muted">
          🔥 <span className="text-wc-warning font-bold">٢٬٣٤٧</span> مشجع دعوا أصدقاءهم الليلة
        </p>
      </div>
    </div>
  );
};

export default InviteScreen;
