import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScheduleFilters } from "@/components/ScheduleFilters";
import { MatchRow } from "@/components/MatchRow";
import { supabase } from "@/integrations/supabase/client";
import { Calendar, TrendingUp, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import type { Match } from "@/types/match";

const Index = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCompetition, setSelectedCompetition] = useState("all");
  const [selectedPriority, setSelectedPriority] = useState("all");
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { data: matches = [], isLoading, refetch } = useQuery({
    queryKey: ['matches'],
    queryFn: async () => {
      const today = new Date().toISOString().split('T')[0];
      const fourWeeksFromNow = new Date(Date.now() + 28 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const { data, error } = await supabase
        .from('matches')
        .select('*')
        .gte('match_date', today)
        .lte('match_date', fourWeeksFromNow)
        .order('match_date', { ascending: true })
        .order('match_time', { ascending: true });

      if (error) throw error;

      return (data || []).map((match): Match => ({
        id: match.id.toString(),
        competition: match.competition_name,
        matchday: match.matchday || '',
        date: match.match_date,
        time: match.match_time || '',
        homeTeam: match.home_team,
        awayTeam: match.away_team,
        status: match.status as Match['status'],
        score: match.score_home !== null && match.score_away !== null 
          ? `${match.score_home}-${match.score_away}` 
          : '',
        stage: match.stage || '',
        priority: match.priority as Match['priority'],
        priorityScore: match.priority_score,
        reason: match.priority_reason || '',
        channel: match.channel || undefined,
        studio: match.studio || undefined,
      }));
    },
  });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      toast.info('Fetching latest match data...');
      
      const { data, error } = await supabase.functions.invoke('sync-football-data', {
        body: { daysAhead: 28 }
      });

      if (error) throw error;

      toast.success(`Updated ${data.total} matches from football-data.org`);
      await refetch();
    } catch (error) {
      console.error('Refresh error:', error);
      toast.error('Failed to refresh match data');
    } finally {
      setIsRefreshing(false);
    }
  };

  const filteredMatches = useMemo(() => {
    return matches.filter((match) => {
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

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Loading matches...</p>
        </div>
      </div>
    );
  }

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
            <div className="flex items-center gap-6">
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
              <Button 
                onClick={handleRefresh} 
                disabled={isRefreshing}
                variant="outline"
                size="sm"
                className="ml-4"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
                {isRefreshing ? 'Syncing...' : 'Refresh Data'}
              </Button>
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
