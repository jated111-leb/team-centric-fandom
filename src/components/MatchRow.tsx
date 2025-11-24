import { TableCell, TableRow } from "@/components/ui/table";
import { PriorityBadge } from "./PriorityBadge";
import { StatusBadge } from "./StatusBadge";
import { CompetitionBadge } from "./CompetitionBadge";
import type { Match } from "@/types/match";
import { formatMatchDateTime } from "@/lib/timezone";

interface MatchRowProps {
  match: Match;
}

export const MatchRow = ({ match }: MatchRowProps) => {
  // Format date/time in Baghdad timezone if utc_date is available
  const matchDateTime = match.utcDate 
    ? formatMatchDateTime(match.utcDate)
    : { date: match.date, time: match.time };

  return (
    <TableRow className="hover:bg-muted/50 transition-colors">
      <TableCell className="font-medium">
        <CompetitionBadge competition={match.competition} />
      </TableCell>
      <TableCell className="text-center text-muted-foreground">
        {match.matchday || "—"}
      </TableCell>
      <TableCell className="font-medium whitespace-nowrap">
        {matchDateTime.date}
        <div className="text-xs text-muted-foreground">Baghdad Time</div>
      </TableCell>
      <TableCell className="font-medium whitespace-nowrap">
        {matchDateTime.time}
      </TableCell>
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
