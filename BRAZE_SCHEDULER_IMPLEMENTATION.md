# Braze Scheduler - Full Feature Parity Implementation

## ✅ Completed Phases

### Phase 1: Critical Deduplication (HIGH PRIORITY) ✅

**Signature-based Reconciliation:**
- ✅ Fetches all future schedules with trigger_properties from Braze
- ✅ Extracts `sig` from each schedule
- ✅ Compares against current desired signatures from schedule_ledger
- ✅ Cancels any schedules with signatures not in the ledger
- ✅ Logs all cancellation actions to `scheduler_logs` table

**Match-based Deduplication:**
- ✅ Groups schedules by match_id from trigger_properties
- ✅ Keeps only the earliest upcoming schedule per match
- ✅ Cancels duplicates automatically
- ✅ Logs deduplication actions with details

### Phase 2: Automation & Locking (HIGH PRIORITY) ✅

**Cron Job Automation:**
- ✅ `braze-scheduler` runs every 15 minutes automatically
- ✅ `braze-reconcile` runs daily at 3 AM
- ✅ Uses pg_cron and pg_net extensions
- ✅ No manual intervention required

**Concurrency Protection:**
- ✅ Advisory locks using `pg_advisory_lock` for both functions
- ✅ Lock key 1001 for braze-scheduler
- ✅ Lock key 1002 for braze-reconcile
- ✅ Functions skip execution if another instance is running
- ✅ Locks automatically released on completion

### Phase 3: Data Integrity (MEDIUM PRIORITY) ✅

**Canonical Team Mapping:**
- ✅ Created `team_mappings` table with regex patterns
- ✅ Maps team name variations to canonical names (e.g., "Barça" → "FC Barcelona")
- ✅ Supports fuzzy matching with regex patterns
- ✅ Pre-populated with 10 featured teams and common variations
- ✅ Used in braze-scheduler for featured team identification

**Match ID Validation:**
- ✅ Uses database match ID as primary identifier
- ✅ Ensures match IDs are unique and stable
- ✅ Signature-based deduplication provides additional safety

### Phase 4: Operational Improvements (MEDIUM PRIORITY) ✅

**Monitoring and Logging:**
- ✅ Created `scheduler_logs` table for comprehensive tracking
- ✅ Logs all actions: created, updated, skipped, error, cancelled
- ✅ Includes match_id, function_name, reason, and detailed context
- ✅ Indexed for fast querying by function, match, action, and date

**Debug Utilities:**
- ✅ Created `braze-debug` edge function with 3 modes:
  - `?action=consistency` - Verify schedule consistency between ledger and Braze
  - `?action=logs` - Fetch recent logs with statistics
  - `?action=campaign` - List all schedules for the campaign
- ✅ Accessible via Supabase function invoke

### Phase 5: UI Enhancements (LOW PRIORITY) ✅

**Admin Dashboard Improvements:**
- ✅ Added `SchedulerStats` component showing:
  - Summary statistics (created, updated, skipped, errors)
  - Recent errors with details
  - Action breakdown
  - Manual trigger buttons for scheduler and reconcile
  - Debug console button
- ✅ Display current Braze campaign ID
- ✅ Enhanced "How it works" section with complete feature list
- ✅ Uses `FEATURED_TEAMS` from centralized config
- ✅ Real-time stats refresh after manual operations

## 🎯 Feature Parity Status

### ✅ Implemented from Google Script

| Feature | Status | Implementation |
|---------|--------|----------------|
| **SEND_OFFSET_MIN (60 min)** | ✅ | `SEND_OFFSET_MINUTES = 60` in braze-scheduler |
| **UPDATE_BUFFER_MIN (20 min)** | ✅ | `UPDATE_BUFFER_MINUTES = 20` prevents updates close to send time |
| **Signature-based deduplication** | ✅ | In braze-reconcile, compares sigs and cancels mismatches |
| **Match-based deduplication** | ✅ | Groups by match_id, keeps earliest, cancels rest |
| **Canonical team mapping** | ✅ | team_mappings table with regex patterns |
| **Featured team filtering** | ✅ | Uses canonical mapping for identification |
| **Send time computation** | ✅ | kickoff - 60 minutes, skips if passed |
| **Signature building** | ✅ | `sendAtUtc|team1+team2` format |
| **Multi-language properties** | ✅ | Arabic and English for teams/competitions |
| **Update existing schedules** | ✅ | In-place updates via Braze API |
| **Reconciliation** | ✅ | Daily cron job, cancels orphaned schedules |
| **Concurrency control** | ✅ | Advisory locks prevent race conditions |
| **Automated triggers** | ✅ | pg_cron runs scheduler every 15 min, reconcile daily |
| **Monitoring/logging** | ✅ | scheduler_logs table tracks all operations |
| **Debug utilities** | ✅ | braze-debug function with consistency checks |

### 🔄 Differences from Google Script

| Feature | Google Script | Our Implementation | Note |
|---------|---------------|-------------------|------|
| **Ledger storage** | Google Sheets _Schedules tab | Supabase schedule_ledger table | More robust, transactional |
| **Locking mechanism** | DocumentLock + ScriptLock | pg_advisory_lock | Better for concurrent edge functions |
| **Trigger** | Apps Script time-based trigger | pg_cron | More reliable, cloud-native |
| **Match ID fallback** | Builds slug from match details | Uses database match ID | Simpler, more reliable |
| **Team mapping** | Hard-coded SB_CANON_TEAMS regex | Database team_mappings table | More flexible, maintainable |

## 🛡️ Risk Mitigation

| Risk | Severity | Status | Mitigation |
|------|----------|--------|------------|
| **Duplicate notifications** | HIGH | ✅ MITIGATED | Signature + match-based deduplication |
| **Orphaned schedules** | MEDIUM | ✅ MITIGATED | Daily reconciliation, cancels untracked schedules |
| **Race conditions** | MEDIUM | ✅ MITIGATED | Advisory locks prevent concurrent runs |
| **Silent skips** | MEDIUM | ✅ MITIGATED | Comprehensive logging with reasons |
| **Stale schedules** | LOW | ✅ MITIGATED | Daily cleanup of past matches from ledger |
| **Double-send near buffer** | LOW | ✅ MITIGATED | 20-minute update buffer |

## 📊 Database Schema

### New Tables

**team_mappings**
- Stores regex patterns for canonical team name matching
- Enables fuzzy matching (e.g., "Man Utd" → "Manchester United FC")
- Pre-populated with featured teams

**scheduler_logs**
- Comprehensive audit log of all scheduler operations
- Tracks skips, errors, creates, updates, cancellations
- Indexed for fast querying and analysis

### New Functions

**pg_try_advisory_lock(key integer)**
- Wrapper for PostgreSQL advisory locks
- Returns boolean indicating lock acquisition success

**pg_advisory_unlock(key integer)**
- Releases advisory locks
- Called at end of edge function execution

## 🚀 Cron Jobs

1. **braze-scheduler-every-15-min**
   - Schedule: `*/15 * * * *` (every 15 minutes)
   - Function: Processes upcoming matches, creates/updates schedules

2. **braze-reconcile-daily**
   - Schedule: `0 3 * * *` (daily at 3 AM)
   - Function: Cleans orphaned schedules, deduplicates, removes past entries

## 🔧 Admin Interface

### Manual Controls
- **Run Scheduler** - Manually trigger scheduler run (useful for testing)
- **Run Reconcile** - Manually trigger reconciliation
- **Debug** - Check consistency between Braze and ledger

### Statistics Display
- Real-time counts: created, updated, skipped, errors
- Recent error log with details
- Action breakdown by type
- Campaign ID display

## 📝 Usage Examples

### Manual Scheduler Run
```typescript
const { data } = await supabase.functions.invoke('braze-scheduler');
// Returns: { scheduled, updated, skipped }
```

### Manual Reconcile Run
```typescript
const { data } = await supabase.functions.invoke('braze-reconcile');
// Returns: { cancelled, signatureCancelled, matchDedupCancelled, cleaned, total_cancelled }
```

### Debug Consistency Check
```typescript
const { data } = await supabase.functions.invoke('braze-debug', {
  body: { action: 'consistency' }
});
// Returns: detailed consistency report
```

### View Logs
```typescript
const { data: logs } = await supabase
  .from('scheduler_logs')
  .select('*')
  .order('created_at', { ascending: false })
  .limit(100);
```

## 🎓 Key Improvements Over Google Script

1. **Transactional Safety** - Database transactions ensure data consistency
2. **Concurrent Execution Protection** - Advisory locks prevent race conditions
3. **Better Observability** - Comprehensive logging and debug utilities
4. **Flexible Configuration** - Database-driven team mappings
5. **Cloud-Native Architecture** - Serverless edge functions with cron
6. **Type Safety** - TypeScript throughout the stack
7. **Real-time Monitoring** - Live dashboard with statistics

## ⚠️ Pre-existing Security Warning

One pre-existing security warning remains: "Extension in Public"
- This is unrelated to the scheduler implementation
- Refers to extensions installed in public schema
- Does not affect scheduler functionality
- Can be addressed separately if needed

## 🎉 Summary

All 5 phases have been successfully implemented with full feature parity to the Google Script version. The system now includes:
- Automatic deduplication (signature + match-based)
- Concurrency protection with advisory locks
- Automated cron scheduling (15 min + daily)
- Comprehensive monitoring and logging
- Flexible canonical team mapping
- Enhanced admin UI with manual controls
- Debug utilities for troubleshooting

The Braze scheduler is now production-ready with robust error handling, complete observability, and all the safety mechanisms from the original Google Script implementation.
