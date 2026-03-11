import { ArrowRight } from "lucide-react";
import { mockPartnerLogos } from "@/lib/worldcupMockData";

interface SubscriptionScreenProps {
  onBack: () => void;
}

const SubscriptionScreen = ({ onBack }: SubscriptionScreenProps) => (
  <div className="flex-1 flex flex-col" style={{ background: "#0D1117" }}>
    {/* Header */}
    <div className="flex items-center px-4 py-3">
      <button onClick={onBack}>
        <ArrowRight size={20} color="#fff" />
      </button>
      <span className="text-white font-bold text-lg mr-3">1001</span>
    </div>

    {/* Featured Image */}
    <div className="mx-4 rounded-2xl h-48 flex items-center justify-center" style={{ background: "linear-gradient(135deg, #1C2128 0%, #0D2818 100%)" }}>
      <div className="text-center">
        <span className="text-5xl">📺</span>
        <p className="text-white font-bold mt-2">محتوى بلا حدود</p>
      </div>
    </div>

    {/* Partner Logos */}
    <div className="mt-6 px-4">
      <div className="grid grid-cols-3 gap-3">
        {mockPartnerLogos.map((p) => (
          <div
            key={p.id}
            className="rounded-xl h-16 flex items-center justify-center text-xs font-bold text-white"
            style={{
              background: "#161B22",
              border: p.selected ? "2px solid #2ECC71" : "1px solid #1C2128",
            }}
          >
            {p.name}
          </div>
        ))}
      </div>
    </div>

    {/* Copy */}
    <div className="mt-6 px-4 text-center">
      <h2 className="text-white font-bold text-xl">دفعة واحدة، وصول كامل</h2>
      <p className="text-sm mt-1" style={{ color: "#8B949E" }}>ادفع في 1001، شاهد في كل مكان</p>
      <p className="text-xs mt-3 leading-relaxed" style={{ color: "#8B949E" }}>
        شاهد فوراً على StarzPlay و TOD والمزيد.
        <br />
        استمتع بالمشاهدة على تطبيقاتهم الرسمية بدون أي عناء.
      </p>
    </div>

    {/* CTA */}
    <div className="mt-auto px-4 pb-6 space-y-3">
      <button className="w-full py-3.5 rounded-2xl font-bold text-white text-base" style={{ background: "#2ECC71" }}>
        ابدأ المشاهدة
      </button>
      <button className="w-full text-center text-sm font-medium" style={{ color: "#2ECC71" }}>
        اختر خطة
      </button>
    </div>
  </div>
);

export default SubscriptionScreen;
