import { useState, useEffect } from "react";
import StatusBar from "@/components/worldcup/StatusBar";
import BottomTabBar from "@/components/worldcup/BottomTabBar";
import MatchHub from "@/components/worldcup/MatchHub";
import SubscriptionScreen from "@/components/worldcup/SubscriptionScreen";
import InviteScreen from "@/components/worldcup/InviteScreen";
import { supabase } from "@/integrations/supabase/client";
import { loadPointsFromDb, setUsername as storeSetUsername } from "@/lib/pointsStore";

type Screen = "match" | "subscription" | "invite";

export interface UserProfile {
  id: string;
  username: string | null;
  display_name: string | null;
  is_subscribed: boolean;
  subscription_tier: string | null;
}

const WorldCup = () => {
  const [screen, setScreen] = useState<Screen>("match");
  const [activeTab, setActiveTab] = useState("home");
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);

  // On mount: check for an active Supabase session and load the user's profile
  useEffect(() => {
    let ignore = false;

    const loadProfile = async (userId: string) => {
      const { data } = await (supabase as any)
        .from("profiles")
        .select("id, username, display_name, is_subscribed, subscription_tier")
        .eq("id", userId)
        .maybeSingle();

      if (ignore) return;

      if (data) {
        setUserProfile(data as UserProfile);
        const name = data.username ?? data.display_name ?? null;
        if (name) storeSetUsername(name);
        await loadPointsFromDb(userId, name ?? "");
      } else {
        setUserProfile({ id: userId, username: null, display_name: null, is_subscribed: false, subscription_tier: null });
      }
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) loadProfile(session.user.id);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) loadProfile(session.user.id);
      else if (!ignore) setUserProfile(null);
    });

    return () => {
      ignore = true;
      subscription.unsubscribe();
    };
  }, []);

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
  };

  const handleProfileUpdate = (updates: Partial<UserProfile>) => {
    setUserProfile((prev) => prev ? { ...prev, ...updates } : prev);
  };

  return (
    <div className="flex justify-center min-h-screen bg-black">
      <div
        className="relative flex flex-col w-full max-w-[390px] min-h-screen overflow-hidden bg-wc-bg font-arabic"
        dir="rtl"
      >
        <StatusBar />

        {screen === "match" && (
          <MatchHub
            onBack={() => setScreen("match")}
            onNavigateToSubscription={() => setScreen("subscription")}
            onNavigateToInvite={() => setScreen("invite")}
            userProfile={userProfile}
          />
        )}
        {screen === "subscription" && (
          <SubscriptionScreen
            onBack={() => setScreen("match")}
            userProfile={userProfile}
            onSubscribed={() => handleProfileUpdate({ is_subscribed: true, subscription_tier: "premium" })}
          />
        )}
        {screen === "invite" && (
          <InviteScreen
            onBack={() => setScreen("match")}
            username={userProfile?.username ?? userProfile?.display_name}
          />
        )}

        {screen !== "subscription" && screen !== "invite" && (
          <BottomTabBar activeTab={activeTab} onTabChange={handleTabChange} />
        )}
      </div>
    </div>
  );
};

export default WorldCup;
