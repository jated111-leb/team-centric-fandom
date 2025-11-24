import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Info } from 'lucide-react';
import { ScheduledNotificationsTable } from '@/components/ScheduledNotificationsTable';
import { BrazeSchedulesView } from '@/components/BrazeSchedulesView';
import { SchedulerStats } from '@/components/SchedulerStats';
import { AlertMonitor } from '@/components/AlertMonitor';
import { FeaturedTeamsManager } from '@/components/FeaturedTeamsManager';
import { FEATURED_TEAMS } from '@/lib/teamConfig';

export default function Admin() {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [campaignId, setCampaignId] = useState<string>('');
  const { toast } = useToast();

  useEffect(() => {
    fetchFeatureFlag();
    setCampaignId(import.meta.env.VITE_BRAZE_CAMPAIGN_ID || 'Not configured');
  }, []);

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

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-4xl font-bold text-foreground">Admin Panel</h1>
          <p className="text-muted-foreground mt-2">
            Manage Braze notification settings and monitor scheduler activity
          </p>
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

        <FeaturedTeamsManager />

        <BrazeSchedulesView />

        <ScheduledNotificationsTable />
      </div>
    </div>
  );
}
