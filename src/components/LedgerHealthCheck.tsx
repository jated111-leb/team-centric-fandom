import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatBaghdadTime } from "@/lib/timezone";

interface HealthCheckResult {
  total_in_ledger: number;
  total_in_braze: number;
  matched: number;
  in_ledger_only: Array<{
    match_id: number;
    braze_schedule_id: string;
    send_at_utc: string;
  }>;
  in_braze_only: Array<{
    schedule_id: string;
    send_at: string;
    home_team?: string;
    away_team?: string;
  }>;
  signature_duplicates: Array<{
    signature: string;
    count: number;
    schedule_ids: string[];
  }>;
  missing_dispatch_ids: number;
}

export const LedgerHealthCheck = () => {
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<HealthCheckResult | null>(null);
  const { toast } = useToast();

  const runHealthCheck = async () => {
    setChecking(true);
    try {
      // Fetch ledger data
      const { data: ledgerData, error: ledgerError } = await supabase
        .from('schedule_ledger')
        .select('*');

      if (ledgerError) throw ledgerError;

      // Fetch Braze schedules
      const { data: brazeData, error: brazeError } = await supabase.functions.invoke('fetch-braze-schedules', {
        body: {},
      });

      if (brazeError) throw brazeError;

      const brazeSchedules = brazeData.schedules || [];
      
      // Create lookup maps
      const ledgerMap = new Map(ledgerData?.map(l => [l.braze_schedule_id, l]) || []);
      const brazeMap = new Map(brazeSchedules.map((s: any) => [s.schedule_id, s]));
      
      // Find matches and mismatches
      const matched = ledgerData?.filter(l => brazeMap.has(l.braze_schedule_id)).length || 0;
      const inLedgerOnly = ledgerData?.filter(l => !brazeMap.has(l.braze_schedule_id)) || [];
      const inBrazeOnly = brazeSchedules.filter((s: any) => !ledgerMap.has(s.schedule_id));
      
      // Find signature duplicates in ledger
      const signatureGroups = new Map<string, string[]>();
      ledgerData?.forEach(l => {
        if (!signatureGroups.has(l.signature)) {
          signatureGroups.set(l.signature, []);
        }
        signatureGroups.get(l.signature)!.push(l.braze_schedule_id);
      });
      
      const signatureDuplicates = Array.from(signatureGroups.entries())
        .filter(([_, ids]) => ids.length > 1)
        .map(([signature, schedule_ids]) => ({
          signature,
          count: schedule_ids.length,
          schedule_ids,
        }));

      // Count missing dispatch_ids
      const missingDispatchIds = ledgerData?.filter(l => !l.dispatch_id).length || 0;

      const healthResult: HealthCheckResult = {
        total_in_ledger: ledgerData?.length || 0,
        total_in_braze: brazeSchedules.length,
        matched,
        in_ledger_only: inLedgerOnly.map(l => ({
          match_id: l.match_id,
          braze_schedule_id: l.braze_schedule_id,
          send_at_utc: l.send_at_utc,
        })),
        in_braze_only: inBrazeOnly.map((s: any) => ({
          schedule_id: s.schedule_id,
          send_at: s.send_at,
          home_team: s.home_team,
          away_team: s.away_team,
        })),
        signature_duplicates: signatureDuplicates,
        missing_dispatch_ids: missingDispatchIds,
      };

      setResult(healthResult);

      const issues = 
        healthResult.in_ledger_only.length + 
        healthResult.in_braze_only.length + 
        healthResult.signature_duplicates.length;

      toast({
        title: issues === 0 ? "Health Check Passed" : "Issues Found",
        description: issues === 0 
          ? `All ${matched} schedules are in sync`
          : `Found ${issues} potential issues`,
        variant: issues === 0 ? "default" : "destructive",
      });
    } catch (error) {
      console.error('Health check error:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to run health check",
        variant: "destructive",
      });
    } finally {
      setChecking(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Ledger Health Check</CardTitle>
            <CardDescription>
              Compare schedule ledger with live Braze schedules
            </CardDescription>
          </div>
          <Button 
            onClick={runHealthCheck} 
            disabled={checking}
            size="sm"
          >
            {checking ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <AlertTriangle className="h-4 w-4 mr-2" />
            )}
            Run Check
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {!result && !checking && (
          <div className="text-center py-8 text-muted-foreground">
            Click "Run Check" to analyze ledger health
          </div>
        )}

        {result && (
          <div className="space-y-6">
            {/* Summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-muted rounded-lg p-4">
                <div className="text-2xl font-bold text-foreground">
                  {result.total_in_ledger}
                </div>
                <div className="text-sm text-muted-foreground">In Ledger</div>
              </div>
              <div className="bg-muted rounded-lg p-4">
                <div className="text-2xl font-bold text-foreground">
                  {result.total_in_braze}
                </div>
                <div className="text-sm text-muted-foreground">In Braze</div>
              </div>
              <div className="bg-muted rounded-lg p-4">
                <div className="text-2xl font-bold text-green-600">
                  {result.matched}
                </div>
                <div className="text-sm text-muted-foreground">Matched</div>
              </div>
              <div className="bg-muted rounded-lg p-4">
                <div className="text-2xl font-bold text-orange-600">
                  {result.missing_dispatch_ids}
                </div>
                <div className="text-sm text-muted-foreground">Missing IDs</div>
              </div>
            </div>

            {/* Orphaned in Ledger */}
            {result.in_ledger_only.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <XCircle className="h-4 w-4 text-destructive" />
                  <h3 className="text-sm font-semibold">
                    Orphaned in Ledger ({result.in_ledger_only.length})
                  </h3>
                </div>
                <div className="text-xs text-muted-foreground mb-2">
                  These schedules exist in ledger but not in Braze (may have been cancelled or sent)
                </div>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {result.in_ledger_only.map((item) => (
                    <div key={item.braze_schedule_id} className="bg-destructive/10 border border-destructive/20 rounded p-3 text-sm">
                      <div className="font-mono text-xs">{item.braze_schedule_id}</div>
                      <div className="text-muted-foreground mt-1">
                        Match ID: {item.match_id} • {formatBaghdadTime(new Date(item.send_at_utc), 'MMM dd, HH:mm')}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Missing from Ledger */}
            {result.in_braze_only.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-orange-600" />
                  <h3 className="text-sm font-semibold">
                    Missing from Ledger ({result.in_braze_only.length})
                  </h3>
                </div>
                <div className="text-xs text-muted-foreground mb-2">
                  These schedules exist in Braze but not in our ledger
                </div>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {result.in_braze_only.map((item) => (
                    <div key={item.schedule_id} className="bg-orange-100 dark:bg-orange-950 border border-orange-200 dark:border-orange-800 rounded p-3 text-sm">
                      <div className="font-mono text-xs">{item.schedule_id}</div>
                      <div className="text-muted-foreground mt-1">
                        {item.home_team && item.away_team && `${item.home_team} vs ${item.away_team} • `}
                        {formatBaghdadTime(new Date(item.send_at), 'MMM dd, HH:mm')}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Signature Duplicates */}
            {result.signature_duplicates.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                  <h3 className="text-sm font-semibold">
                    Signature Duplicates ({result.signature_duplicates.length})
                  </h3>
                </div>
                <div className="text-xs text-muted-foreground mb-2">
                  Multiple ledger entries share the same fixture signature
                </div>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {result.signature_duplicates.map((dup, idx) => (
                    <div key={idx} className="bg-destructive/10 border border-destructive/20 rounded p-3 text-sm">
                      <div className="font-semibold">{dup.count} duplicates</div>
                      <div className="text-muted-foreground mt-1 text-xs font-mono">
                        {dup.signature}
                      </div>
                      <div className="mt-2 space-y-1">
                        {dup.schedule_ids.map(id => (
                          <div key={id} className="text-xs font-mono opacity-70">{id}</div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* All Good */}
            {result.in_ledger_only.length === 0 && 
             result.in_braze_only.length === 0 && 
             result.signature_duplicates.length === 0 && (
              <div className="flex items-center justify-center gap-2 py-8 text-green-600">
                <CheckCircle2 className="h-5 w-5" />
                <span className="font-semibold">All schedules are in sync!</span>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};