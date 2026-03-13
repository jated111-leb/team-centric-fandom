import { Search, Cast, Crown, ChevronLeft } from "lucide-react";
import { mockOriginals, mockChannels } from "@/lib/worldcupMockData";

interface HomeFeedProps {
  onNavigateToMatch: () => void;
  onNavigateToSubscription: () => void;
}

const HomeFeed = ({ onNavigateToMatch, onNavigateToSubscription }: HomeFeedProps) => (
  <div className="flex-1 overflow-y-auto pb-4" style={{ background: "#0D1117" }}>
    {/* Top Bar */}
    <div className="flex items-center justify-between px-4 py-3">
      <Cast size={20} color="#fff" />
      <span className="text-white font-bold text-lg tracking-wide">1001</span>
      <Search size={20} color="#fff" />
    </div>

    {/* Hero Banner */}
    <div className="mx-4 rounded-2xl overflow-hidden relative" style={{ background: "linear-gradient(135deg, #1C2128 0%, #161B22 100%)" }}>
      <div className="h-44 flex items-end p-4 relative">
        <div className="absolute top-3 left-3 px-2 py-0.5 rounded text-[10px] font-bold text-white" style={{ background: "#2ECC71" }}>
          TOD
        </div>
        <div className="text-right w-full">
          <h2 className="text-white font-bold text-lg leading-tight">دوري أبطال آسيا</h2>
          <p className="text-xs mt-1" style={{ color: "#8B949E" }}>مباراة الليلة · مباشر</p>
          <button className="mt-2 px-4 py-1.5 rounded-full text-xs font-bold text-white" style={{ background: "#2ECC71" }}>
            شاهد الآن
          </button>
        </div>
      </div>
    </div>

    {/* 1001 Originals */}
    <div className="mt-5 px-4">
      <h3 className="text-white font-bold text-sm mb-3">حصرياً على 1001</h3>
      <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide" style={{ direction: "ltr" }}>
        {mockOriginals.map((item) => (
          <div key={item.id} className="flex-shrink-0 w-[120px]">
            <div className="rounded-xl h-[160px] relative flex items-end p-2" style={{ background: "linear-gradient(180deg, #1C2128 0%, #0D1117 100%)" }}>
              {item.premium && (
                <div className="absolute top-2 right-2">
                  <Crown size={14} color="#2ECC71" fill="#2ECC71" />
                </div>
              )}
              <span className="text-white text-[11px] font-medium leading-tight">{item.title}</span>
            </div>
          </div>
        ))}
      </div>
    </div>

    {/* Live Channels */}
    <div className="mt-5 px-4">
      <h3 className="text-white font-bold text-sm mb-3">قنوات مباشرة</h3>
      <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide" style={{ direction: "ltr" }}>
        {mockChannels.map((ch) => (
          <div key={ch.id} className="flex-shrink-0 flex flex-col items-center gap-1.5">
            <div className="w-14 h-14 rounded-full flex items-center justify-center text-[10px] font-bold text-white" style={{ background: "#1C2128", border: "1px solid #2ECC71" }}>
              {ch.name.slice(0, 3)}
            </div>
            <span className="text-[10px]" style={{ color: "#8B949E" }}>{ch.name}</span>
          </div>
        ))}
      </div>
    </div>

    {/* World Cup Banner */}
    <div className="mt-5 mx-4">
      <button
        onClick={onNavigateToMatch}
        className="w-full rounded-2xl overflow-hidden relative text-right"
        style={{ background: "linear-gradient(135deg, #0D2818 0%, #1C2128 50%, #0D1117 100%)" }}
      >
        <div className="p-5">
          <div className="text-3xl mb-1">⚽🏆</div>
          <h2 className="text-white font-bold text-xl leading-tight">كأس العالم 2026</h2>
          <p className="text-xs mt-1" style={{ color: "#8B949E" }}>مباشر · تعليق عربي · تفاعل مع الجمهور</p>
          <div className="mt-3 inline-flex items-center gap-1 px-4 py-2 rounded-full text-xs font-bold text-white" style={{ background: "#2ECC71" }}>
            <span>جدول المباريات</span>
            <ChevronLeft size={14} />
          </div>
        </div>
      </button>
    </div>

    {/* Subscribe Button */}
    <div className="mt-6 flex justify-center">
      <button
        onClick={onNavigateToSubscription}
        className="px-8 py-3 rounded-full font-bold text-white text-sm shadow-lg"
        style={{ background: "#2ECC71" }}
      >
        اشترك الآن
      </button>
    </div>
  </div>
);

export default HomeFeed;
