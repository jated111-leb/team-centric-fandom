import { TableCell, TableRow } from "@/components/ui/table";
import { PriorityBadge } from "./PriorityBadge";
import { StatusBadge } from "./StatusBadge";
import { CompetitionBadge } from "./CompetitionBadge";
import type { Match } from "@/types/match";

interface MatchRowProps {
  match: Match;
}

export const MatchRow = ({ match }: MatchRowProps) => {
  return (
    <TableRow className="hover:bg-muted/50 transition-colors">
      <TableCell className="font-medium">
        <CompetitionBadge competition={match.competition} />
      </TableCell>
      <TableCell className="text-center text-muted-foreground">
        {match.matchday || "—"}
      </TableCell>
      <TableCell className="font-medium whitespace-nowrap">{match.date}</TableCell>
      <TableCell className="font-medium whitespace-nowrap">{match.time}</TableCell>
      <TableCell className="font-semibold">{match.homeTeam}</TableCell>
      <TableCell className="font-semibold">{match.awayTeam}</TableCell>
      <TableCell>
        <StatusBadge status={match.status} />
      </TableCell>
      <TableCell className="text-center font-bold">{match.score || "—"}</TableCell>
      <TableCell className="text-sm text-muted-foreground">{match.stage || "—"}</TableCell>
      <TableCell>
        <PriorityBadge priority={match.priority} />
      </TableCell>
      <TableCell className="text-center text-sm">{match.priorityScore}</TableCell>
      <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
        {match.reason || "—"}
      </TableCell>
    </TableRow>
  );
};
