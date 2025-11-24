import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Info, FileText, Trash2 } from 'lucide-react';
import { ScheduledNotificationsTable } from '@/components/ScheduledNotificationsTable';
import { BrazeSchedulesView } from '@/components/BrazeSchedulesView';
import { SchedulerStats } from '@/components/SchedulerStats';
import { AlertMonitor } from '@/components/AlertMonitor';
import { FeaturedTeamsManager } from '@/components/FeaturedTeamsManager';
import { NotificationPreview } from '@/components/NotificationPreview';
import { FEATURED_TEAMS } from '@/lib/teamConfig';

export default function Admin() {
  const navigate = useNavigate();
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [campaignId, setCampaignId] = useState<string>('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [cleaningUp, setCleaningUp] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    checkAdminAccess();
  }, []);

  const checkAdminAccess = async () => {
    try {
      // Check if user is logged in
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        window.location.href = '/auth';
        return;
      }

      // Check if user has admin role
      const { data: roles, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', session.user.id)
        .eq('role', 'admin')
        .maybeSingle();

      if (error) {
        console.error('Error checking admin role:', error);
        toast({
          title: 'Access Denied',
          description: 'Unable to verify admin access',
          variant: 'destructive',
        });
        window.location.href = '/auth';
        return;
      }

      if (!roles) {
        toast({
          title: 'Access Denied',
          description: 'You do not have admin access',
          variant: 'destructive',
        });
        window.location.href = '/auth';
        return;
      }

      setIsAdmin(true);
      fetchFeatureFlag();
      fetchBrazeConfig();
    } catch (error) {
      console.error('Auth check error:', error);
      window.location.href = '/auth';
    } finally {
      setCheckingAuth(false);
    }
  };

  const fetchBrazeConfig = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-braze-config`,
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        setCampaignId(data.campaignId || 'Not configured');
      } else {
        setCampaignId('Not configured');
      }
    } catch (error) {
      console.error('Error fetching Braze config:', error);
      setCampaignId('Not configured');
    }
  };

  const fetchFeatureFlag = async () => {
    try {
      const { data, error } = await supabase
        .from('feature_flags')
        .select('enabled')
        .eq('flag_name', 'braze_notifications_enabled')
        .single();

      if (error) throw error;
      setEnabled(data?.enabled || false);
    } catch (error) {
      console.error('Error fetching feature flag:', error);
      toast({
        title: 'Error',
        description: 'Failed to load feature flag status',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const toggleFeature = async (checked: boolean) => {
    setUpdating(true);
    try {
      const { error } = await supabase
        .from('feature_flags')
        .update({ enabled: checked })
        .eq('flag_name', 'braze_notifications_enabled');

      if (error) throw error;

      setEnabled(checked);
      toast({
        title: checked ? 'Notifications Enabled' : 'Notifications Disabled',
        description: checked
          ? 'Braze push notifications will now be scheduled automatically'
          : 'Braze push notifications have been disabled',
      });
    } catch (error) {
      console.error('Error updating feature flag:', error);
      toast({
        title: 'Error',
        description: 'Failed to update feature flag',
        variant: 'destructive',
      });
    } finally {
      setUpdating(false);
    }
  };

  const cleanupNonFeaturedSchedules = async () => {
    setCleaningUp(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cleanup-non-featured-schedules`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Cleanup failed');
      }

      toast({
        title: 'Cleanup Complete',
        description: `Deleted ${result.deleted.from_ledger} schedules from database and ${result.deleted.from_braze} from Braze`,
      });

      // Refresh the data
      window.location.reload();
    } catch (error) {
      console.error('Error cleaning up schedules:', error);
      toast({
        title: 'Cleanup Failed',
        description: error instanceof Error ? error.message : 'Failed to clean up non-featured schedules',
        variant: 'destructive',
      });
    } finally {
      setCleaningUp(false);
    }
  };

  if (checkingAuth || loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAdmin) {
    return null; // Will redirect to /auth
  }

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold text-foreground">Admin Panel</h1>
            <p className="text-muted-foreground mt-2">
              Manage Braze notification settings and monitor scheduler activity
            </p>
          </div>
          <div className="flex gap-2">
            <NotificationPreview />
            <Button onClick={() => navigate('/admin/notification-logs')} variant="outline">
              <FileText className="h-4 w-4 mr-2" />
              View Notification Logs
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Braze Push Notifications</CardTitle>
            <CardDescription>
              Control whether push notifications are automatically scheduled for featured team matches
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="braze-toggle" className="text-base">
                  Enable Notifications
                </Label>
                <p className="text-sm text-muted-foreground">
                  {enabled
                    ? 'Notifications are being sent 60 minutes before featured matches'
                    : 'Notifications are currently disabled'}
                </p>
              </div>
              <Switch
                id="braze-toggle"
                checked={enabled}
                onCheckedChange={toggleFeature}
                disabled={updating}
              />
            </div>

            {enabled && (
              <div className="rounded-lg bg-muted p-4 space-y-3">
                <h3 className="font-semibold text-sm flex items-center gap-2">
                  <Info className="h-4 w-4" />
                  How it works
                </h3>
                <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                  <li>Runs automatically every 15 minutes via cron job</li>
                  <li>Sends notifications 60 minutes before kickoff</li>
                  <li>Only for matches featuring the configured teams below</li>
                  <li>Uses Braze Connected Attributes (Team 1/2/3)</li>
                  <li>Automatically updates if match times change (with 20min buffer)</li>
                  <li>Reconciles daily to clean up orphaned schedules</li>
                  <li>Deduplicates by signature and match ID</li>
                </ul>
                <div className="border-t border-border pt-3 mt-3">
                  <p className="text-xs text-muted-foreground">
                    <span className="font-semibold">Campaign ID:</span> {campaignId}
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <AlertMonitor />

        <SchedulerStats />

        <Card>
          <CardHeader>
            <CardTitle>Cleanup Actions</CardTitle>
            <CardDescription>
              Remove schedules for matches not featuring any of the configured teams
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="rounded-lg bg-muted p-4">
                <p className="text-sm text-muted-foreground">
                  This will delete all scheduled notifications for matches that don't involve any featured teams. 
                  This includes removing them from both the schedule ledger and Braze.
                </p>
              </div>
              <Button
                onClick={cleanupNonFeaturedSchedules}
                disabled={cleaningUp}
                variant="destructive"
                className="w-full sm:w-auto"
              >
                {cleaningUp ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Cleaning up...
                  </>
                ) : (
                  <>
                    <Trash2 className="mr-2 h-4 w-4" />
                    Clean Up Non-Featured Team Schedules
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        <FeaturedTeamsManager />

        <BrazeSchedulesView />

        <ScheduledNotificationsTable />
      </div>
    </div>
  );
}
