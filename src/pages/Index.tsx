import { useState, useMemo } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { ScheduleFilters } from "@/components/ScheduleFilters";
import { MatchRow } from "@/components/MatchRow";
import { mockMatches } from "@/lib/mockData";
import { Calendar, TrendingUp } from "lucide-react";

const Index = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCompetition, setSelectedCompetition] = useState("all");
  const [selectedPriority, setSelectedPriority] = useState("all");

  const filteredMatches = useMemo(() => {
    return mockMatches.filter((match) => {
      const matchesSearch =
        searchQuery === "" ||
        match.homeTeam.toLowerCase().includes(searchQuery.toLowerCase()) ||
        match.awayTeam.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesCompetition =
        selectedCompetition === "all" || match.competition === selectedCompetition;

      const matchesPriority =
        selectedPriority === "all" || match.priority === selectedPriority;

      return matchesSearch && matchesCompetition && matchesPriority;
    });
  }, [searchQuery, selectedCompetition, selectedPriority]);

  const stats = useMemo(() => {
    const highPriority = filteredMatches.filter((m) => m.priority === "High").length;
    const total = filteredMatches.length;
    return { highPriority, total };
  }, [filteredMatches]);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card shadow-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground">1001 Sports Schedule</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Internal match scheduling & notification management
              </p>
            </div>
            <div className="flex gap-6 text-sm">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-primary" />
                <span className="text-muted-foreground">
                  <span className="font-semibold text-foreground">{stats.total}</span> matches
                </span>
              </div>
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-priority-high" />
                <span className="text-muted-foreground">
                  <span className="font-semibold text-foreground">{stats.highPriority}</span> high priority
                </span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <ScheduleFilters
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          selectedCompetition={selectedCompetition}
          onCompetitionChange={setSelectedCompetition}
          selectedPriority={selectedPriority}
          onPriorityChange={setSelectedPriority}
        />

        <Card className="shadow-card">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="font-bold">Competition</TableHead>
                  <TableHead className="font-bold text-center">MD</TableHead>
                  <TableHead className="font-bold">Date</TableHead>
                  <TableHead className="font-bold">Time</TableHead>
                  <TableHead className="font-bold">Home Team</TableHead>
                  <TableHead className="font-bold">Away Team</TableHead>
                  <TableHead className="font-bold">Status</TableHead>
                  <TableHead className="font-bold text-center">Score</TableHead>
                  <TableHead className="font-bold">Stage</TableHead>
                  <TableHead className="font-bold">Priority</TableHead>
                  <TableHead className="font-bold text-center">Score</TableHead>
                  <TableHead className="font-bold">Reason</TableHead>
                  <TableHead className="font-bold">Channel</TableHead>
                  <TableHead className="font-bold text-center">Studio</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredMatches.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={14} className="text-center py-12 text-muted-foreground">
                      No matches found matching your filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredMatches.map((match) => (
                    <MatchRow key={match.id} match={match} />
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      </main>
    </div>
  );
};

export default Index;
