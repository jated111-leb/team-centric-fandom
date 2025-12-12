import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { ScheduleFilters } from "@/components/ScheduleFilters";
import { MatchRow } from "@/components/MatchRow";
import { supabase } from "@/integrations/supabase/client";
import { Calendar, TrendingUp, RefreshCw } from "lucide-react";
import type { Match } from "@/types/match";

const Index = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCompetition, setSelectedCompetition] = useState("all");
  const [selectedPriority, setSelectedPriority] = useState("all");
  const [selectedTeams, setSelectedTeams] = useState<string[]>([]);

  // Fetch featured teams from database
  const { data: featuredTeamsData = [] } = useQuery({
    queryKey: ['featured-teams'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('featured_teams')
        .select('team_name');
      
      if (error) throw error;
      return data.map(t => t.team_name);
    },
  });

  const { data: matches = [], isLoading, refetch } = useQuery({
    queryKey: ['matches', selectedTeams, featuredTeamsData],
    queryFn: async () => {
      const today = new Date().toISOString().split('T')[0];
      const fourWeeksFromNow = new Date(Date.now() + 28 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const teamsToFilter = selectedTeams.length > 0 
        ? selectedTeams 
        : featuredTeamsData.length > 0 
          ? featuredTeamsData 
          : [];

      const { data, error } = await supabase
        .from('matches')
        .select('*')
        .gte('match_date', today)
        .lte('match_date', fourWeeksFromNow)
        .or(
          teamsToFilter.map(team => `home_team.eq.${team},away_team.eq.${team}`).join(',')
        )
        .order('match_date', { ascending: true })
        .order('match_time', { ascending: true });

      if (error) throw error;

      return (data || []).map((match): Match => ({
        id: match.id.toString(),
        competition: match.competition_name,
        matchday: match.matchday || '',
        date: match.match_date,
        time: match.match_time || '',
        utcDate: match.utc_date,
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

  // Real-time subscription for match updates
  useEffect(() => {
    const channel = supabase
      .channel('matches-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'matches'
        },
        (payload) => {
          console.log('Match update received:', payload);
          refetch();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [refetch]);


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
  }, [matches, searchQuery, selectedCompetition, selectedPriority]);

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
    <div className="bg-background">
      {/* Page Header */}
      <div className="border-b bg-card/50 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Match Schedule</h1>
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
              <TrendingUp className="h-4 w-4 text-destructive" />
              <span className="text-muted-foreground">
                <span className="font-semibold text-foreground">{stats.highPriority}</span> high priority
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="p-6">
        <ScheduleFilters
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          selectedCompetition={selectedCompetition}
          onCompetitionChange={setSelectedCompetition}
          selectedPriority={selectedPriority}
          onPriorityChange={setSelectedPriority}
          selectedTeams={selectedTeams}
          onTeamsChange={setSelectedTeams}
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
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredMatches.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={12} className="text-center py-12 text-muted-foreground">
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
