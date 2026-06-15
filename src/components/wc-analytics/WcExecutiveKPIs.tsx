import type { WcAnalyticsBundle } from '@/hooks/wc/useWorldCup';
import { Kpi } from './shared';
import { Send, Trophy, Users, MailOpen, MousePointerClick, AlertTriangle } from 'lucide-react';

export function WcExecutiveKPIs({ data }: { data: WcAnalyticsBundle }) {
  const { preGame, postGame, gapAlerts, perMatch } = data;
  const matchesNotified = perMatch.filter((m) => m.preGameStatus === 'delivered' || m.preGameStatus === 'sent').length;
  const combinedSent = preGame.sent + postGame.sent;
  const combinedOpens = preGame.directOpens + postGame.directOpens;
  const combinedClicks = preGame.bodyClicks + postGame.bodyClicks;
  const openRate = combinedSent > 0 ? ((combinedOpens / combinedSent) * 100).toFixed(1) : '0';
  const clickRate = combinedSent > 0 ? ((combinedClicks / combinedSent) * 100).toFixed(1) : '0';

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      <Kpi icon={<Send />} label="Matches notified" value={matchesNotified} sub={`${perMatch.length} matches in range`} />
      <Kpi icon={<Users />} label="Pre-game reach" value={preGame.uniqueRecipients.toLocaleString()} sub={`${preGame.sent.toLocaleString()} sent`} />
      <Kpi icon={<Trophy />} label="Post-game reach" value={postGame.uniqueRecipients.toLocaleString()} sub={`${postGame.sent.toLocaleString()} sent`} tone="success" />
      <Kpi icon={<MailOpen />} label="Open rate" value={`${openRate}%`} sub={`${combinedOpens.toLocaleString()} opens`} />
      <Kpi icon={<MousePointerClick />} label="Click rate" value={`${clickRate}%`} sub={`${combinedClicks.toLocaleString()} clicks`} />
      <Kpi icon={<AlertTriangle />} label="Gap alerts" value={gapAlerts} tone={gapAlerts > 0 ? 'destructive' : 'success'} />
    </div>
  );
}
