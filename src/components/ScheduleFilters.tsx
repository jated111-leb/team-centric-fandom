import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Search, Users } from "lucide-react";
import { FEATURED_TEAMS } from "@/lib/teamConfig";
import type { Competition } from "@/types/match";

interface ScheduleFiltersProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  selectedCompetition: string;
  onCompetitionChange: (value: string) => void;
  selectedPriority: string;
  onPriorityChange: (value: string) => void;
  selectedTeams: string[];
  onTeamsChange: (teams: string[]) => void;
}

const competitions: Competition[] = [
  "LaLiga",
  "Premier_League",
  "Serie_A",
  "Ligue_1",
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
  selectedTeams,
  onTeamsChange,
}: ScheduleFiltersProps) => {
  const handleTeamToggle = (team: string) => {
    if (selectedTeams.includes(team)) {
      onTeamsChange(selectedTeams.filter(t => t !== team));
    } else {
      onTeamsChange([...selectedTeams, team]);
    }
  };

  const clearTeams = () => onTeamsChange([]);

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

      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" className="w-full sm:w-[220px] justify-between">
            <span className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              {selectedTeams.length === 0 
                ? "All Teams" 
                : `${selectedTeams.length} team${selectedTeams.length > 1 ? 's' : ''}`}
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[280px] p-0 bg-popover z-50" align="start">
          <div className="p-3 border-b bg-popover">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-sm">Select Teams</h4>
              {selectedTeams.length > 0 && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={clearTeams}
                  className="h-7 text-xs"
                >
                  Clear
                </Button>
              )}
            </div>
          </div>
          <div className="max-h-[300px] overflow-y-auto bg-popover">
            {FEATURED_TEAMS.map((team) => (
              <div
                key={team}
                className="flex items-center space-x-2 p-3 hover:bg-accent cursor-pointer"
                onClick={() => handleTeamToggle(team)}
              >
                <Checkbox
                  id={team}
                  checked={selectedTeams.includes(team)}
                  onCheckedChange={() => handleTeamToggle(team)}
                />
                <label
                  htmlFor={team}
                  className="text-sm cursor-pointer flex-1"
                >
                  {team}
                </label>
              </div>
            ))}
          </div>
        </PopoverContent>
      </Popover>
      
      <Select value={selectedCompetition} onValueChange={onCompetitionChange}>
        <SelectTrigger className="w-full sm:w-[220px]">
          <SelectValue placeholder="All Competitions" />
        </SelectTrigger>
        <SelectContent className="bg-popover z-50">
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
        <SelectContent className="bg-popover z-50">
          <SelectItem value="all">All Priorities</SelectItem>
          <SelectItem value="High">High Priority</SelectItem>
          <SelectItem value="Medium">Medium Priority</SelectItem>
          <SelectItem value="Low">Low Priority</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
};
