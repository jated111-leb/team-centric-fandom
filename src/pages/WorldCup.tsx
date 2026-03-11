import { useState } from "react";
import StatusBar from "@/components/worldcup/StatusBar";
import BottomTabBar from "@/components/worldcup/BottomTabBar";
import HomeFeed from "@/components/worldcup/HomeFeed";
import MatchHub from "@/components/worldcup/MatchHub";
import SubscriptionScreen from "@/components/worldcup/SubscriptionScreen";

type Screen = "home" | "match" | "subscription";

const WorldCup = () => {
  const [screen, setScreen] = useState<Screen>("home");
  const [activeTab, setActiveTab] = useState("home");

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    if (tab === "home") setScreen("home");
  };

  return (
    <div className="flex justify-center min-h-screen" style={{ background: "#000" }}>
      <div
        className="relative flex flex-col w-full max-w-[390px] min-h-screen overflow-hidden"
        dir="rtl"
        style={{ background: "#0D1117", fontFamily: "'Inter', sans-serif" }}
      >
        <StatusBar />

        {screen === "home" && (
          <HomeFeed
            onNavigateToMatch={() => setScreen("match")}
            onNavigateToSubscription={() => setScreen("subscription")}
          />
        )}
        {screen === "match" && (
          <MatchHub onBack={() => setScreen("home")} />
        )}
        {screen === "subscription" && (
          <SubscriptionScreen onBack={() => setScreen("home")} />
        )}

        {screen !== "subscription" && (
          <BottomTabBar activeTab={activeTab} onTabChange={handleTabChange} />
        )}
      </div>
    </div>
  );
};

export default WorldCup;
