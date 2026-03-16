import { useState } from "react";
import { ArrowRight, MessageCircle, Bell, Tv, Radio } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { UserProfile } from "@/pages/WorldCup";
import todLogo from "@/assets/tod-logo.png";

interface SubscriptionScreenProps {
  onBack: () => void;
  userProfile?: UserProfile | null;
  onSubscribed?: () => void;
}

const benefits = [
  {
    icon: MessageCircle,
    title: "دردش مع المشجعين المحليين",
    description: "تفاعل مباشر مع جمهور بلدك أثناء المباريات",
  },
  {
    icon: Bell,
    title: "اختر فريقك واحصل على كل الأخبار",
    description: "تحديثات فورية ونتائج وأخبار فريقك المفضل",
  },
  {
    icon: Tv,
    title: "شاهد على الموبايل + التلفزيون",
    description: "بث مباشر على جميع أجهزتك بجودة عالية",
  },
  {
    icon: Radio,
    title: "كل مباراة — مباشرة",
    description: "تغطية كاملة لجميع مباريات كأس العالم 2026",
  },
];

const SubscriptionScreen = ({ onBack, userProfile, onSubscribed }: SubscriptionScreenProps) => {
  const [subscribing, setSubscribing] = useState(false);
  const isSubscribed = userProfile?.is_subscribed ?? false;

  const handleSubscribe = async () => {
    if (isSubscribed || subscribing) return;
    setSubscribing(true);

    if (userProfile?.id) {
      await (supabase as any)
        .from("profiles")
        .update({
          is_subscribed: true,
          subscription_tier: "premium",
          subscribed_at: new Date().toISOString(),
        })
        .eq("id", userProfile.id);
    }

    onSubscribed?.();
    setSubscribing(false);
    onBack();
  };

  return (
    <div className="flex-1 flex flex-col bg-wc-bg">
      {/* Header */}
      <div className="flex items-center px-4 py-3">
        <button onClick={onBack} className="text-wc-text">
          <ArrowRight size={20} />
        </button>
        <span className="text-wc-text font-bold text-lg mr-3">باقة كأس العالم</span>
      </div>

      {/* Hero Card with TOD branding */}
      <div
        className="mx-4 rounded-2xl overflow-hidden border border-wc-border"
        style={{ background: "linear-gradient(135deg, #1a0a2e 0%, #2d1b4e 50%, #0d1b2a 100%)" }}
      >
        <div className="flex flex-col items-center py-6 px-4">
          <img src={todLogo} alt="TOD" className="h-10 object-contain mb-3" />
          <p className="text-wc-text font-bold text-xl text-center">باقة كأس العالم 2026</p>
          <p className="text-wc-muted text-sm mt-1 text-center">كل المباريات. كل اللحظات. مكان واحد.</p>
          <div className="mt-3 flex items-center gap-2">
            <span className="text-2xl">🏆</span>
            <span className="text-2xl">⚽</span>
            <span className="text-2xl">🌍</span>
          </div>
        </div>
      </div>

      {/* Benefits List */}
      <div className="mt-5 px-4 space-y-3">
        {benefits.map((b, i) => (
          <div
            key={i}
            className="flex items-start gap-3 p-3 rounded-xl bg-wc-surface border border-wc-border"
          >
            <div className="flex-shrink-0 w-9 h-9 rounded-full bg-wc-accent/20 flex items-center justify-center mt-0.5">
              <b.icon size={18} className="text-wc-accent" />
            </div>
            <div className="min-w-0">
              <p className="text-wc-text font-bold text-sm leading-tight">{b.title}</p>
              <p className="text-wc-muted text-xs mt-0.5 leading-relaxed">{b.description}</p>
            </div>
          </div>
        ))}
      </div>

      {/* CTA */}
      <div className="mt-auto px-4 pb-6 pt-4 space-y-3">
        {isSubscribed ? (
          <div className="w-full py-3.5 rounded-full text-center font-bold text-wc-accent-foreground text-base bg-wc-elevated border border-wc-accent">
            ✅ أنت مشترك بالفعل
          </div>
        ) : (
          <button
            onClick={handleSubscribe}
            disabled={subscribing}
            className="w-full py-3.5 rounded-full font-bold text-wc-accent-foreground text-base bg-wc-accent disabled:opacity-60 shadow-lg"
          >
            {subscribing ? "جارٍ الاشتراك..." : "اشترك الآن في باقة كأس العالم"}
          </button>
        )}
        <p className="text-center text-xs text-wc-muted">
          اشترك عبر TOD وشاهد جميع المباريات مباشرة
        </p>
      </div>
    </div>
  );
};

export default SubscriptionScreen;
