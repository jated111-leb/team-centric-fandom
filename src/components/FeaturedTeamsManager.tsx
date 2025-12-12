import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { CollapsibleCard } from '@/components/ui/collapsible-card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Plus, Trash2, AlertCircle } from 'lucide-react';
import { z } from 'zod';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const teamNameSchema = z
  .string()
  .trim()
  .min(2, { message: 'Team name must be at least 2 characters' })
  .max(100, { message: 'Team name must be less than 100 characters' })
  .regex(/^[a-zA-Z0-9\s\u00C0-\u024F\u1E00-\u1EFF.-]+$/, {
    message: 'Team name contains invalid characters',
  });

interface FeaturedTeam {
  id: string;
  team_name: string;
  braze_attribute_value: string | null;
  created_at: string;
}

export function FeaturedTeamsManager() {
  const [teams, setTeams] = useState<FeaturedTeam[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTeamName, setNewTeamName] = useState('');
  const [adding, setAdding] = useState(false);
  const [teamToDelete, setTeamToDelete] = useState<FeaturedTeam | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [validationError, setValidationError] = useState<string>('');
  const [editingBrazeValue, setEditingBrazeValue] = useState<{ [key: string]: string }>({});
  const [updatingBrazeValue, setUpdatingBrazeValue] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchTeams();
  }, []);

  const fetchTeams = async () => {
    try {
      const { data, error } = await supabase
        .from('featured_teams')
        .select('id, team_name, braze_attribute_value, created_at')
        .order('team_name', { ascending: true });

      if (error) throw error;
      setTeams(data || []);
    } catch (error) {
      console.error('Error fetching teams:', error);
      toast({
        title: 'Error',
        description: 'Failed to load featured teams',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const validateTeamName = (name: string): boolean => {
    try {
      teamNameSchema.parse(name);
      setValidationError('');
      return true;
    } catch (error) {
      if (error instanceof z.ZodError) {
        setValidationError(error.errors[0].message);
      }
      return false;
    }
  };

  const addTeam = async () => {
    if (!validateTeamName(newTeamName)) return;

    setAdding(true);
    try {
      const { error } = await supabase
        .from('featured_teams')
        .insert({ team_name: newTeamName.trim() });

      if (error) {
        if (error.code === '23505') {
          // Unique constraint violation
          toast({
            title: 'Team Already Exists',
            description: 'This team is already in the featured list',
            variant: 'destructive',
          });
        } else {
          throw error;
        }
        return;
      }

      toast({
        title: 'Team Added',
        description: `${newTeamName} has been added to featured teams`,
      });

      setNewTeamName('');
      setValidationError('');
      fetchTeams();
    } catch (error) {
      console.error('Error adding team:', error);
      toast({
        title: 'Error',
        description: 'Failed to add team',
        variant: 'destructive',
      });
    } finally {
      setAdding(false);
    }
  };

  const deleteTeam = async () => {
    if (!teamToDelete) return;

    setDeleting(true);
    try {
      const { error } = await supabase
        .from('featured_teams')
        .delete()
        .eq('id', teamToDelete.id);

      if (error) throw error;

      toast({
        title: 'Team Removed',
        description: `${teamToDelete.team_name} has been removed from featured teams`,
      });

      setTeamToDelete(null);
      fetchTeams();
    } catch (error) {
      console.error('Error deleting team:', error);
      toast({
        title: 'Error',
        description: 'Failed to remove team',
        variant: 'destructive',
      });
    } finally {
      setDeleting(false);
    }
  };

  const handleInputChange = (value: string) => {
    setNewTeamName(value);
    if (value.trim()) {
      validateTeamName(value);
    } else {
      setValidationError('');
    }
  };

  const updateBrazeValue = async (teamId: string, newValue: string) => {
    setUpdatingBrazeValue(teamId);
    try {
      const { error } = await supabase
        .from('featured_teams')
        .update({ braze_attribute_value: newValue.trim() || null })
        .eq('id', teamId);

      if (error) throw error;

      toast({
        title: 'Braze Value Updated',
        description: 'The Braze attribute value has been updated',
      });

      // Clear editing state
      const newEditingState = { ...editingBrazeValue };
      delete newEditingState[teamId];
      setEditingBrazeValue(newEditingState);

      fetchTeams();
    } catch (error) {
      console.error('Error updating Braze value:', error);
      toast({
        title: 'Error',
        description: 'Failed to update Braze value',
        variant: 'destructive',
      });
    } finally {
      setUpdatingBrazeValue(null);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center p-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <CollapsibleCard
        title="Featured Teams"
        description={`Notifications are sent for matches featuring any of these teams (${teams.length} teams)`}
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex gap-2">
              <div className="flex-1">
                <Input
                  placeholder="Enter team name (e.g., Chelsea FC)"
                  value={newTeamName}
                  onChange={(e) => handleInputChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newTeamName.trim() && !validationError) {
                      addTeam();
                    }
                  }}
                  disabled={adding}
                  className={validationError ? 'border-destructive' : ''}
                />
                {validationError && (
                  <div className="flex items-center gap-1 mt-1 text-xs text-destructive">
                    <AlertCircle className="h-3 w-3" />
                    {validationError}
                  </div>
                )}
              </div>
              <Button
                onClick={addTeam}
                disabled={adding || !newTeamName.trim() || !!validationError}
                size="default"
              >
                {adding ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Team
                  </>
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Team names should match exactly how they appear in match data
            </p>
          </div>

          {/* Teams List */}
          <div className="space-y-3">
            {teams.map((team) => (
              <div
                key={team.id}
                className="p-4 rounded-lg border border-border bg-card space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{team.team_name}</span>
                  <Button
                    onClick={() => setTeamToDelete(team)}
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <label className="text-xs text-muted-foreground mb-1 block">
                      Braze Attribute Value {!team.braze_attribute_value && <AlertCircle className="inline h-3 w-3 text-yellow-500" />}
                    </label>
                    <Input
                      value={editingBrazeValue[team.id] ?? team.braze_attribute_value ?? ''}
                      onChange={(e) => setEditingBrazeValue({ ...editingBrazeValue, [team.id]: e.target.value })}
                      placeholder="e.g., Real Madrid"
                      className="h-8 text-sm"
                      disabled={updatingBrazeValue === team.id}
                    />
                  </div>
                  {editingBrazeValue[team.id] !== undefined && editingBrazeValue[team.id] !== (team.braze_attribute_value ?? '') && (
                    <Button
                      onClick={() => updateBrazeValue(team.id, editingBrazeValue[team.id])}
                      size="sm"
                      disabled={updatingBrazeValue === team.id}
                      className="h-8 mt-5"
                    >
                      {updatingBrazeValue === team.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        'Save'
                      )}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {teams.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <p className="text-sm">No featured teams configured</p>
              <p className="text-xs mt-1">Add teams to start scheduling notifications</p>
            </div>
          )}
        </div>
      </CollapsibleCard>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!teamToDelete} onOpenChange={(open) => !open && setTeamToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Featured Team</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove <strong>{teamToDelete?.team_name}</strong> from the featured teams list?
              <br /><br />
              Future matches for this team will no longer trigger notifications.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={deleteTeam}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Removing...
                </>
              ) : (
                'Remove Team'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
