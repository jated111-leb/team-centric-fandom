import { Badge } from "@/components/ui/badge";
import { Trophy, Crown, Star, Flame, Shield, Zap } from "lucide-react";

const COMPETITION_CONFIG = {
  LaLiga: {
    icon: Crown,
    color: "bg-[hsl(340,85%,55%)] text-white border-[hsl(340,85%,55%)]",
    label: "LaLiga"
  },
  Premier_League: {
    icon: Shield,
    color: "bg-[hsl(270,70%,55%)] text-white border-[hsl(270,70%,55%)]",
    label: "Premier League"
  },
  Serie_A: {
    icon: Star,
    color: "bg-[hsl(200,85%,50%)] text-white border-[hsl(200,85%,50%)]",
    label: "Serie A"
  },
  Ligue_1: {
    icon: Flame,
    color: "bg-[hsl(25,90%,55%)] text-white border-[hsl(25,90%,55%)]",
    label: "Ligue 1"
  },
  Dutch_League_starzplay: {
    icon: Trophy,
    color: "bg-[hsl(30,90%,50%)] text-white border-[hsl(30,90%,50%)]",
    label: "Eredivisie"
  },
  Champions_League: {
    icon: Star,
    color: "bg-[hsl(220,80%,45%)] text-white border-[hsl(220,80%,45%)]",
    label: "Champions League"
  },
  Europa_League: {
    icon: Trophy,
    color: "bg-[hsl(30,95%,50%)] text-white border-[hsl(30,95%,50%)]",
    label: "Europa League"
  },
  Europa_Conference: {
    icon: Shield,
    color: "bg-[hsl(140,60%,45%)] text-white border-[hsl(140,60%,45%)]",
    label: "Europa Conference"
  },
  Carabao_Cup: {
    icon: Trophy,
    color: "bg-[hsl(180,70%,40%)] text-white border-[hsl(180,70%,40%)]",
    label: "Carabao Cup"
  }
};

interface CompetitionBadgeProps {
  competition: string;
}

export const CompetitionBadge = ({ competition }: CompetitionBadgeProps) => {
  const config = COMPETITION_CONFIG[competition as keyof typeof COMPETITION_CONFIG] || {
    icon: Trophy,
    color: "bg-muted text-muted-foreground border-border",
    label: competition.replace(/_/g, " ")
  };

  const Icon = config.icon;

  return (
    <Badge 
      variant="outline" 
      className={`text-xs font-semibold flex items-center gap-1.5 px-2.5 py-1 ${config.color}`}
    >
      <Icon className="h-3.5 w-3.5" />
      <span>{config.label}</span>
    </Badge>
  );
};
