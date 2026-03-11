import { useState } from "react";
import StatusBar from "@/components/worldcup/StatusBar";
import BottomTabBar from "@/components/worldcup/BottomTabBar";
import HomeFeed from "@/components/worldcup/HomeFeed";
import MatchHub from "@/components/worldcup/MatchHub";
import SubscriptionScreen from "@/components/worldcup/SubscriptionScreen";

type Screen = "match" | "subscription";

const WorldCup = () => {
  const [screen, setScreen] = useState<Screen>("match");
  const [activeTab, setActiveTab] = useState("home");

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
  };

  return (
    <div className="flex justify-center min-h-screen bg-black">
      <div
        className="relative flex flex-col w-full max-w-[390px] min-h-screen overflow-hidden bg-wc-bg font-arabic"
        dir="rtl"
        style={{ fontFamily: "'Inter', sans-serif" }}
      >
        <StatusBar />

        {screen === "match" && (
          <MatchHub onBack={() => setScreen("match")} onNavigateToSubscription={() => setScreen("subscription")} />
        )}
        {screen === "subscription" && (
          <SubscriptionScreen onBack={() => setScreen("match")} />
        )}

        {screen !== "subscription" && (
          <BottomTabBar activeTab={activeTab} onTabChange={handleTabChange} />
        )}
      </div>
    </div>
  );
};

export default WorldCup;
