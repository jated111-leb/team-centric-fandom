/**
 * Real Madrid Notification Analysis Script
 *
 * This script queries the notification_sends table to analyze
 * Real Madrid game notifications and calculate user reach per game.
 *
 * Usage:
 *   npx ts-node scripts/analyze-real-madrid-notifications.ts
 *
 * Or via Supabase SQL Editor - copy the SQL queries from
 * scripts/real-madrid-notification-analysis.sql
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://howqpclucdljsovsjnrz.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';

if (!SUPABASE_KEY) {
  console.error('Error: SUPABASE_SERVICE_ROLE_KEY or VITE_SUPABASE_PUBLISHABLE_KEY environment variable required');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

interface NotificationSend {
  id: string;
  match_id: number | null;
  home_team: string | null;
  away_team: string | null;
  competition: string | null;
  kickoff_utc: string | null;
  external_user_id: string | null;
  braze_event_type: string;
  sent_at: string;
}

interface MatchStats {
  match_id: number;
  home_team: string;
  away_team: string;
  competition: string;
  kickoff_utc: string;
  unique_users: number;
  total_notifications: number;
}

async function analyzeRealMadridNotifications() {
  console.log('\n=== Real Madrid Notification Analysis ===\n');

  // Fetch all Real Madrid notifications
  const { data: notifications, error } = await supabase
    .from('notification_sends')
    .select('id, match_id, home_team, away_team, competition, kickoff_utc, external_user_id, braze_event_type, sent_at')
    .or('home_team.ilike.%Real Madrid%,away_team.ilike.%Real Madrid%')
    .order('kickoff_utc', { ascending: false });

  if (error) {
    console.error('Error fetching notifications:', error.message);
    return;
  }

  if (!notifications || notifications.length === 0) {
    console.log('No Real Madrid notifications found in the database.');
    return;
  }

  console.log(`Found ${notifications.length} total notification records for Real Madrid games.\n`);

  // Group by match
  const matchMap = new Map<number, {
    notifications: NotificationSend[];
    users: Set<string>;
    match_id: number;
    home_team: string;
    away_team: string;
    competition: string;
    kickoff_utc: string;
  }>();

  for (const notification of notifications) {
    if (!notification.match_id) continue;

    if (!matchMap.has(notification.match_id)) {
      matchMap.set(notification.match_id, {
        notifications: [],
        users: new Set(),
        match_id: notification.match_id,
        home_team: notification.home_team || 'N/A',
        away_team: notification.away_team || 'N/A',
        competition: notification.competition || 'N/A',
        kickoff_utc: notification.kickoff_utc || 'N/A',
      });
    }

    const match = matchMap.get(notification.match_id)!;
    match.notifications.push(notification);
    if (notification.external_user_id) {
      match.users.add(notification.external_user_id);
    }
  }

  // Convert to array and sort by kickoff
  const matchStats: MatchStats[] = Array.from(matchMap.values())
    .map(m => ({
      match_id: m.match_id,
      home_team: m.home_team,
      away_team: m.away_team,
      competition: m.competition,
      kickoff_utc: m.kickoff_utc,
      unique_users: m.users.size,
      total_notifications: m.notifications.length,
    }))
    .sort((a, b) => new Date(b.kickoff_utc).getTime() - new Date(a.kickoff_utc).getTime());

  // Print results
  console.log('='.repeat(120));
  console.log('REAL MADRID GAMES WITH NOTIFICATIONS');
  console.log('='.repeat(120));
  console.log('');
  console.log(
    'Match ID'.padEnd(10) +
    'Match'.padEnd(45) +
    'Competition'.padEnd(20) +
    'Kickoff (UTC)'.padEnd(22) +
    'Users'.padEnd(10) +
    'Notifications'
  );
  console.log('-'.repeat(120));

  let totalUsers = new Set<string>();
  let totalNotifications = 0;

  for (const match of matchStats) {
    const matchDesc = match.home_team.includes('Real Madrid')
      ? `${match.home_team} vs ${match.away_team}`
      : `${match.away_team} @ ${match.home_team}`;

    console.log(
      String(match.match_id).padEnd(10) +
      matchDesc.substring(0, 43).padEnd(45) +
      match.competition.substring(0, 18).padEnd(20) +
      match.kickoff_utc.substring(0, 19).padEnd(22) +
      String(match.unique_users).padEnd(10) +
      String(match.total_notifications)
    );

    totalNotifications += match.total_notifications;

    // Collect unique users across all matches
    const matchData = matchMap.get(match.match_id);
    if (matchData) {
      matchData.users.forEach(u => totalUsers.add(u));
    }
  }

  console.log('-'.repeat(120));
  console.log('');

  // Summary statistics
  console.log('='.repeat(60));
  console.log('SUMMARY STATISTICS');
  console.log('='.repeat(60));
  console.log(`Total Real Madrid Games with Notifications: ${matchStats.length}`);
  console.log(`Total Unique Users Reached (across all games): ${totalUsers.size}`);
  console.log(`Total Notifications Sent: ${totalNotifications}`);
  console.log(`Average Users per Game: ${(totalUsers.size / matchStats.length).toFixed(1)}`);
  console.log(`Average Notifications per Game: ${(totalNotifications / matchStats.length).toFixed(1)}`);
  console.log('');

  // Competition breakdown
  const competitionStats = new Map<string, { games: number; users: Set<string>; notifications: number }>();
  for (const match of matchStats) {
    if (!competitionStats.has(match.competition)) {
      competitionStats.set(match.competition, { games: 0, users: new Set(), notifications: 0 });
    }
    const stats = competitionStats.get(match.competition)!;
    stats.games++;
    stats.notifications += match.total_notifications;

    const matchData = matchMap.get(match.match_id);
    if (matchData) {
      matchData.users.forEach(u => stats.users.add(u));
    }
  }

  console.log('='.repeat(60));
  console.log('BREAKDOWN BY COMPETITION');
  console.log('='.repeat(60));
  console.log('Competition'.padEnd(25) + 'Games'.padEnd(10) + 'Unique Users'.padEnd(15) + 'Notifications');
  console.log('-'.repeat(60));

  for (const [competition, stats] of competitionStats) {
    console.log(
      competition.substring(0, 23).padEnd(25) +
      String(stats.games).padEnd(10) +
      String(stats.users.size).padEnd(15) +
      String(stats.notifications)
    );
  }
  console.log('');
}

// Run the analysis
analyzeRealMadridNotifications().catch(console.error);
