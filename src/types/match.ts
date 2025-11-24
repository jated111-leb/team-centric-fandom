export type Match = {
  id: string;
  competition: string;
  matchday: string;
  date: string;
  time: string;
  utcDate?: string; // UTC timestamp for timezone conversions
  homeTeam: string;
  awayTeam: string;
  status: "SCHEDULED" | "LIVE" | "IN_PLAY" | "PAUSED" | "FINISHED" | "POSTPONED" | "CANCELLED" | "TIMED";
  score: string;
  stage: string;
  priority: "High" | "Medium" | "Low";
  priorityScore: number;
  reason: string;
  channel?: string;
  studio?: string;
};

export type Competition = 
  | "LaLiga" 
  | "Premier_League" 
  | "Serie_A" 
  | "Ligue_1" 
  | "Bundesliga" 
  | "Dutch_League_starzplay" 
  | "Champions_League" 
  | "Europa_League" 
  | "Europa_Conference" 
  | "Carabao_Cup";
