import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { CollapsibleCard } from '@/components/ui/collapsible-card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Info, Trophy } from 'lucide-react';

export function CongratsSettings() {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchCongratsFlag();
  }, []);

  const fetchCongratsFlag = async () => {
    try {
      const { data, error } = await supabase
        .from('feature_flags')
        .select('enabled')
        .eq('flag_name', 'congrats_notifications_enabled')
        .maybeSingle();

      if (error) throw error;
      setEnabled(data?.enabled || false);
    } catch (error) {
      console.error('Error fetching congrats feature flag:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleCongrats = async (checked: boolean) => {
    setUpdating(true);
    try {
      const { error } = await supabase
        .from('feature_flags')
        .update({ enabled: checked })
        .eq('flag_name', 'congrats_notifications_enabled');

      if (error) throw error;

      setEnabled(checked);
      toast({
        title: checked ? 'Congrats Notifications Enabled' : 'Congrats Notifications Disabled',
        description: checked
          ? 'Post-match congrats pushes will be sent to winning team fans'
          : 'Post-match congrats notifications have been disabled',
      });
    } catch (error) {
      console.error('Error updating congrats feature flag:', error);
      toast({
        title: 'Error',
        description: 'Failed to update congrats notification setting',
        variant: 'destructive',
      });
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="space-y-6">
      <CollapsibleCard
        title={
          <span className="flex items-center gap-2">
            <Trophy className="h-5 w-5" />
            Congrats Push Notifications
          </span>
        }
        description="Send a congratulations push notification to fans when their team wins"
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="congrats-toggle" className="text-base">
                Enable Congrats Notifications
              </Label>
              <p className="text-sm text-muted-foreground">
                {loading
                  ? 'Loading...'
                  : enabled
                    ? 'Congrats pushes are active for winning team fans'
                    : 'Congrats notifications are currently disabled'}
              </p>
            </div>
            <Switch
              id="congrats-toggle"
              checked={enabled}
              onCheckedChange={toggleCongrats}
              disabled={updating || loading}
            />
          </div>

          {enabled && (
            <div className="rounded-lg bg-muted p-4 space-y-3">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <Info className="h-4 w-4" />
                How it works
              </h3>
              <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                <li>Checks for finished matches every 15 minutes</li>
                <li>Sends 1 push notification per game to fans of the winning team</li>
                <li>Delivered 10-30 minutes after the final whistle</li>
                <li>Uses Braze Campaign API (immediate send, not scheduled)</li>
                <li>Targets users via Team 1/2/3 custom attributes (same as pre-match)</li>
                <li>Only for featured teams in licensed competitions</li>
                <li>Draws are skipped (no notification sent)</li>
                <li>Deduplicates by match ID to prevent double-sends</li>
              </ul>
            </div>
          )}

          {!enabled && !loading && (
            <div className="rounded-lg border border-dashed border-muted-foreground/25 p-4">
              <p className="text-sm text-muted-foreground">
                When enabled, fans of winning teams will receive a congratulations push notification
                shortly after the match ends. This uses the same featured teams and competition
                settings as pre-match notifications.
              </p>
            </div>
          )}
        </div>
      </CollapsibleCard>
    </div>
  );
}
