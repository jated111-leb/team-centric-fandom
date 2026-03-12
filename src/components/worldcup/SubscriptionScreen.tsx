import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { mockPartnerLogos } from "@/lib/worldcupMockData";
import { supabase } from "@/integrations/supabase/client";
import type { UserProfile } from "@/pages/WorldCup";

interface SubscriptionScreenProps {
  onBack: () => void;
  userProfile?: UserProfile | null;
  onSubscribed?: () => void;
}

const SubscriptionScreen = ({ onBack, userProfile, onSubscribed }: SubscriptionScreenProps) => {
  const [subscribing, setSubscribing] = useState(false);
  const isSubscribed = userProfile?.is_subscribed ?? false;

  const handleSubscribe = async () => {
    if (isSubscribed || subscribing) return;
    setSubscribing(true);

    if (userProfile?.id) {
      await supabase
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
        <span className="text-wc-text font-bold text-lg mr-3">1001</span>
      </div>

      {/* Featured Image */}
      <div className="mx-4 rounded-2xl h-48 flex items-center justify-center border border-wc-border" style={{ background: "var(--wc-gradient-card)" }}>
        <div className="text-center">
          <span className="text-5xl">📺</span>
          <p className="text-wc-text font-bold mt-2">محتوى بلا حدود</p>
        </div>
      </div>

      {/* Partner Logos */}
      <div className="mt-6 px-4">
        <div className="grid grid-cols-3 gap-3">
          {mockPartnerLogos.map((p) => (
            <div
              key={p.id}
              className={`rounded-xl h-16 flex items-center justify-center text-xs font-bold text-wc-text bg-wc-surface ${
                p.selected ? "border-2 border-wc-accent" : "border border-wc-border"
              }`}
            >
              {p.name}
            </div>
          ))}
        </div>
      </div>

      {/* Copy */}
      <div className="mt-6 px-4 text-center">
        <h2 className="text-wc-text font-bold text-xl">دفعة واحدة، وصول كامل</h2>
        <p className="text-sm mt-1 text-wc-muted">ادفع في 1001، شاهد في كل مكان</p>
        <p className="text-xs mt-3 leading-relaxed text-wc-muted">
          شاهد فوراً على StarzPlay و TOD والمزيد.
          <br />
          استمتع بالمشاهدة على تطبيقاتهم الرسمية بدون أي عناء.
        </p>
      </div>

      {/* CTA */}
      <div className="mt-auto px-4 pb-6 space-y-3">
        {isSubscribed ? (
          <div className="w-full py-3.5 rounded-full text-center font-bold text-wc-accent-foreground text-base bg-wc-elevated border border-wc-accent">
            ✅ أنت مشترك بالفعل
          </div>
        ) : (
          <button
            onClick={handleSubscribe}
            disabled={subscribing}
            className="w-full py-3.5 rounded-full font-bold text-wc-accent-foreground text-base bg-wc-accent disabled:opacity-60"
          >
            {subscribing ? "جارٍ الاشتراك..." : "ابدأ المشاهدة"}
          </button>
        )}
        <button className="w-full text-center text-sm font-medium text-wc-accent">
          اختر خطة
        </button>
      </div>
    </div>
  );
};

export default SubscriptionScreen;
