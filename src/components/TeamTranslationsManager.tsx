import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Plus, Trash2, Languages, Pencil, X, Check, RefreshCw, AlertTriangle } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface TeamTranslation {
  id: string;
  team_name: string;
  arabic_name: string;
  created_at: string;
}

interface UntranslatedTeam {
  team_name: string;
  match_count: number;
}

interface InconsistentTranslation {
  team_name: string;
  arabic_name: string;
  match_team_name: string;
  similarity: string;
}

export function TeamTranslationsManager() {
  const [translations, setTranslations] = useState<TeamTranslation[]>([]);
  const [untranslated, setUntranslated] = useState<UntranslatedTeam[]>([]);
  const [inconsistent, setInconsistent] = useState<InconsistentTranslation[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTeamName, setNewTeamName] = useState('');
  const [newArabicName, setNewArabicName] = useState('');
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingArabicName, setEditingArabicName] = useState('');
  const [updating, setUpdating] = useState(false);
  const [forceRefreshing, setForceRefreshing] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchTranslations();
    fetchUntranslatedTeams();
    fetchInconsistentTranslations();

    // Subscribe to real-time updates
    const channel = supabase
      .channel('team_translations_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'team_translations'
        },
        () => {
          fetchTranslations();
          fetchUntranslatedTeams();
          fetchInconsistentTranslations();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchTranslations = async () => {
    try {
      const { data, error } = await supabase
        .from('team_translations')
        .select('*')
        .order('team_name');

      if (error) throw error;
      setTranslations(data || []);
    } catch (error) {
      console.error('Error fetching translations:', error);
      toast({
        title: 'Error',
        description: 'Failed to load team translations',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchUntranslatedTeams = async () => {
    try {
      // Get upcoming matches
      const now = new Date();
      const thirtyDaysOut = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      const { data: matches, error: matchError } = await supabase
        .from('matches')
        .select('home_team, away_team')
        .gte('utc_date', now.toISOString())
        .lte('utc_date', thirtyDaysOut.toISOString())
        .in('status', ['SCHEDULED', 'TIMED']);

      if (matchError) throw matchError;

      // Get existing translations
      const { data: existingTranslations, error: transError } = await supabase
        .from('team_translations')
        .select('team_name');

      if (transError) throw transError;

      const translatedTeams = new Set(existingTranslations?.map(t => t.team_name) || []);
      const teamCounts = new Map<string, number>();

      // Count untranslated teams
      matches?.forEach(match => {
        if (!translatedTeams.has(match.home_team)) {
          teamCounts.set(match.home_team, (teamCounts.get(match.home_team) || 0) + 1);
        }
        if (!translatedTeams.has(match.away_team)) {
          teamCounts.set(match.away_team, (teamCounts.get(match.away_team) || 0) + 1);
        }
      });

      const untranslatedList = Array.from(teamCounts.entries())
        .map(([team_name, match_count]) => ({ team_name, match_count }))
        .sort((a, b) => b.match_count - a.match_count);

      setUntranslated(untranslatedList);
    } catch (error) {
      console.error('Error fetching untranslated teams:', error);
    }
  };

  const fetchInconsistentTranslations = async () => {
    try {
      // Get all unique team names from matches
      const now = new Date();
      const thirtyDaysOut = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      const { data: matches, error: matchError } = await supabase
        .from('matches')
        .select('home_team, away_team')
        .gte('utc_date', now.toISOString())
        .lte('utc_date', thirtyDaysOut.toISOString())
        .in('status', ['SCHEDULED', 'TIMED']);

      if (matchError) throw matchError;

      // Get all translations
      const { data: translationsData, error: transError } = await supabase
        .from('team_translations')
        .select('*');

      if (transError) throw transError;

      // Get unique match team names
      const matchTeams = new Set<string>();
      matches?.forEach(m => {
        matchTeams.add(m.home_team);
        matchTeams.add(m.away_team);
      });

      // Find translations that don't exactly match any match team name
      // but are similar (potential inconsistencies from manual edits)
      const inconsistentList: InconsistentTranslation[] = [];
      
      // Create a set of all translated team names for quick lookup
      const translatedTeamNames = new Set(translationsData?.map(t => t.team_name) || []);
      
      translationsData?.forEach(trans => {
        if (!matchTeams.has(trans.team_name)) {
          // Check if there's a similar team in matches
          const similarTeam = Array.from(matchTeams).find(mt => {
            const transLower = trans.team_name.toLowerCase();
            const mtLower = mt.toLowerCase();
            // Check for partial matches
            return (
              transLower.includes(mtLower.split(' ')[0]) ||
              mtLower.includes(transLower.split(' ')[0])
            ) && transLower !== mtLower;
          });

          // Only flag as inconsistent if the similar match team doesn't already have its own translation
          if (similarTeam && !translatedTeamNames.has(similarTeam)) {
            inconsistentList.push({
              team_name: trans.team_name,
              arabic_name: trans.arabic_name,
              match_team_name: similarTeam,
              similarity: 'partial_match'
            });
          }
        }
      });

      setInconsistent(inconsistentList);
    } catch (error) {
      console.error('Error checking translation consistency:', error);
    }
  };

  const forceRefreshSchedules = async () => {
    setForceRefreshing(true);
    try {
      // Invoke braze-scheduler to refresh all pending schedules
      const { data, error } = await supabase.functions.invoke('braze-scheduler');

      if (error) throw error;

      toast({
        title: 'Schedules Refreshed',
        description: `Updated: ${data?.updated || 0}, Scheduled: ${data?.scheduled || 0}, Skipped: ${data?.skipped || 0}`,
      });
    } catch (error) {
      console.error('Error refreshing schedules:', error);
      toast({
        title: 'Error',
        description: 'Failed to refresh schedules',
        variant: 'destructive',
      });
    } finally {
      setForceRefreshing(false);
    }
  };

  const addTranslation = async () => {
    if (!newTeamName.trim() || !newArabicName.trim()) {
      toast({
        title: 'Error',
        description: 'Both team name and Arabic name are required',
        variant: 'destructive',
      });
      return;
    }

    setAdding(true);
    try {
      const { error } = await supabase
        .from('team_translations')
        .insert({
          team_name: newTeamName.trim(),
          arabic_name: newArabicName.trim(),
        });

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Translation added successfully',
      });

      setNewTeamName('');
      setNewArabicName('');
      fetchTranslations();
      fetchUntranslatedTeams();
    } catch (error: any) {
      console.error('Error adding translation:', error);
      toast({
        title: 'Error',
        description: error.code === '23505' ? 'This team already has a translation' : 'Failed to add translation',
        variant: 'destructive',
      });
    } finally {
      setAdding(false);
    }
  };

  const updateTranslation = async (id: string) => {
    if (!editingArabicName.trim()) {
      toast({
        title: 'Error',
        description: 'Arabic name is required',
        variant: 'destructive',
      });
      return;
    }

    if (editingArabicName.length > 100) {
      toast({
        title: 'Error',
        description: 'Arabic name must be less than 100 characters',
        variant: 'destructive',
      });
      return;
    }

    setUpdating(true);
    try {
      const { error } = await supabase
        .from('team_translations')
        .update({ arabic_name: editingArabicName.trim() })
        .eq('id', id);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Translation updated successfully',
      });

      setEditingId(null);
      setEditingArabicName('');
      fetchTranslations();
    } catch (error) {
      console.error('Error updating translation:', error);
      toast({
        title: 'Error',
        description: 'Failed to update translation',
        variant: 'destructive',
      });
    } finally {
      setUpdating(false);
    }
  };

  const startEditing = (translation: TeamTranslation) => {
    setEditingId(translation.id);
    setEditingArabicName(translation.arabic_name);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditingArabicName('');
  };

  const deleteTranslation = async (id: string) => {
    try {
      const { error } = await supabase
        .from('team_translations')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Translation deleted successfully',
      });

      fetchTranslations();
      fetchUntranslatedTeams();
    } catch (error) {
      console.error('Error deleting translation:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete translation',
        variant: 'destructive',
      });
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center p-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Languages className="h-5 w-5" />
          <CardTitle>Team Translations</CardTitle>
        </div>
        <CardDescription>
          Manage Arabic translations for team names. New teams are automatically translated using AI, but you can review and edit them here.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Add new translation */}
        <div className="space-y-4 p-4 border rounded-lg bg-muted/50">
          <h3 className="font-semibold text-sm">Add New Translation</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="team-name">Team Name (English)</Label>
              <Input
                id="team-name"
                value={newTeamName}
                onChange={(e) => setNewTeamName(e.target.value)}
                placeholder="e.g., Chelsea FC"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="arabic-name">Team Name (Arabic)</Label>
              <Input
                id="arabic-name"
                value={newArabicName}
                onChange={(e) => setNewArabicName(e.target.value)}
                placeholder="e.g., تشيلسي"
                dir="rtl"
              />
            </div>
          </div>
          <Button onClick={addTranslation} disabled={adding}>
            {adding ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Adding...
              </>
            ) : (
              <>
                <Plus className="mr-2 h-4 w-4" />
                Add Translation
              </>
            )}
          </Button>
        </div>

        {/* Force Refresh Button */}
        <Alert>
          <RefreshCw className="h-4 w-4" />
          <AlertTitle>Force Refresh Schedules</AlertTitle>
          <AlertDescription className="space-y-2">
            <p className="text-sm">
              After editing Arabic translations, click this button to update all pending Braze notifications with the new content.
            </p>
            <Button 
              onClick={forceRefreshSchedules} 
              disabled={forceRefreshing}
              variant="outline"
              size="sm"
            >
              {forceRefreshing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Refreshing...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Refresh All Pending Schedules
                </>
              )}
            </Button>
          </AlertDescription>
        </Alert>

        {/* Inconsistent translations warning */}
        {inconsistent.length > 0 && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Potential Translation Inconsistencies ({inconsistent.length})</AlertTitle>
            <AlertDescription>
              <p className="text-sm mb-3">
                These translations have team names that don't exactly match any upcoming match team names. They may need to be updated.
              </p>
              <div className="space-y-2">
                {inconsistent.slice(0, 5).map((item, idx) => (
                  <div key={idx} className="text-sm bg-background/50 p-2 rounded">
                    <span className="font-mono">"{item.team_name}"</span> → 
                    <span className="font-mono ml-1">"{item.match_team_name}"</span>
                    <span className="text-muted-foreground ml-2">(possible match)</span>
                  </div>
                ))}
                {inconsistent.length > 5 && (
                  <p className="text-sm text-muted-foreground">+{inconsistent.length - 5} more</p>
                )}
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Untranslated teams warning */}
        {untranslated.length > 0 && (
          <div className="p-4 border border-yellow-500/50 bg-yellow-500/10 rounded-lg">
            <h3 className="font-semibold text-sm mb-2 flex items-center gap-2">
              <Languages className="h-4 w-4" />
              Teams Missing Translations ({untranslated.length})
            </h3>
            <p className="text-sm text-muted-foreground mb-3">
              These teams appear in upcoming matches but don't have Arabic translations yet. They will be auto-translated when the scheduler runs.
            </p>
            <div className="flex flex-wrap gap-2">
              {untranslated.slice(0, 10).map(team => (
                <Badge key={team.team_name} variant="outline" className="gap-1">
                  {team.team_name}
                  <span className="text-xs text-muted-foreground">({team.match_count})</span>
                </Badge>
              ))}
              {untranslated.length > 10 && (
                <Badge variant="outline">+{untranslated.length - 10} more</Badge>
              )}
            </div>
          </div>
        )}

        {/* Translations table */}
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>English Name</TableHead>
                <TableHead>Arabic Name</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-[120px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {translations.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    No translations yet
                  </TableCell>
                </TableRow>
              ) : (
                translations.map((translation) => (
                  <TableRow key={translation.id}>
                    <TableCell className="font-medium">{translation.team_name}</TableCell>
                    <TableCell dir="rtl">
                      {editingId === translation.id ? (
                        <div className="flex items-center gap-2">
                          <Input
                            value={editingArabicName}
                            onChange={(e) => setEditingArabicName(e.target.value)}
                            dir="rtl"
                            className="h-8"
                            disabled={updating}
                            maxLength={100}
                            autoFocus
                          />
                        </div>
                      ) : (
                        translation.arabic_name
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(translation.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      {editingId === translation.id ? (
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => updateTranslation(translation.id)}
                            disabled={updating}
                          >
                            {updating ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Check className="h-4 w-4 text-green-600" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={cancelEditing}
                            disabled={updating}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => startEditing(translation)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => deleteTranslation(translation.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <div className="text-sm text-muted-foreground space-y-1">
          <p className="font-semibold">Note:</p>
          <ul className="list-disc list-inside space-y-1">
            <li>The scheduler automatically translates new teams using AI</li>
            <li>You can add or edit translations manually here</li>
            <li>Translations are shared across all competitions</li>
            <li>Changes take effect immediately for new notifications</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}