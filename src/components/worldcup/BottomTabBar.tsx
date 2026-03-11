import { Home, Tv, Baby, Film, User } from "lucide-react";

interface BottomTabBarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const tabs = [
  { id: "account", label: "الحساب", icon: User },
  { id: "shows", label: "برامج", icon: Film },
  { id: "kids", label: "أطفال", icon: Baby },
  { id: "sports", label: "رياضة", icon: Tv },
  { id: "home", label: "الرئيسية", icon: Home },
];

const BottomTabBar = ({ activeTab, onTabChange }: BottomTabBarProps) => (
  <div className="flex items-center justify-around py-2 border-t border-wc-border bg-wc-surface">
    {tabs.map((tab) => {
      const isActive = activeTab === tab.id;
      return (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`flex flex-col items-center gap-0.5 min-w-[56px] py-1 ${isActive ? "text-wc-accent" : "text-wc-muted"}`}
        >
          <tab.icon size={22} />
          <span className="text-[10px]">{tab.label}</span>
        </button>
      );
    })}
  </div>
);

export default BottomTabBar;
