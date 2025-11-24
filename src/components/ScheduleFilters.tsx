import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search } from "lucide-react";
import type { Competition } from "@/types/match";

interface ScheduleFiltersProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  selectedCompetition: string;
  onCompetitionChange: (value: string) => void;
  selectedPriority: string;
  onPriorityChange: (value: string) => void;
}

const competitions: Competition[] = [
  "LaLiga",
  "Premier_League",
  "Serie_A",
  "Ligue_1",
  "Bundesliga",
  "Dutch_League_starzplay",
  "Champions_League",
  "Europa_League",
  "Europa_Conference",
  "Carabao_Cup",
];

export const ScheduleFilters = ({
  searchQuery,
  onSearchChange,
  selectedCompetition,
  onCompetitionChange,
  selectedPriority,
  onPriorityChange,
}: ScheduleFiltersProps) => {
  return (
    <div className="flex flex-col sm:flex-row gap-4 mb-6">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
        <Input
          placeholder="Search teams..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-10"
        />
      </div>
      
      <Select value={selectedCompetition} onValueChange={onCompetitionChange}>
        <SelectTrigger className="w-full sm:w-[220px]">
          <SelectValue placeholder="All Competitions" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Competitions</SelectItem>
          {competitions.map((comp) => (
            <SelectItem key={comp} value={comp}>
              {comp.replace(/_/g, " ")}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={selectedPriority} onValueChange={onPriorityChange}>
        <SelectTrigger className="w-full sm:w-[180px]">
          <SelectValue placeholder="All Priorities" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Priorities</SelectItem>
          <SelectItem value="High">High Priority</SelectItem>
          <SelectItem value="Medium">Medium Priority</SelectItem>
          <SelectItem value="Low">Low Priority</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
};
