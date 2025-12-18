import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { CollapsibleCard } from '@/components/ui/collapsible-card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Search, CheckCircle, AlertTriangle, XCircle, RefreshCw, Settings } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface TeamMapping {
  id: string;
  pattern: string;
  canonical_name: string;
}

interface FeaturedTeam {
  team_name: string;
  braze_attribute_value: string | null;
}

interface VerificationResult {
  team_name: string;
  braze_attribute_value: string;
  status: 'verified' | 'unverified' | 'error';
  user_count?: number;
  error?: string;
}

interface MappingCoverage {
  team_name: string;
  has_mapping: boolean;
  mapping_pattern?: string;
}

export function TeamMappingTester() {
  const [testTeamName, setTestTeamName] = useState('');
  const [testResult, setTestResult] = useState<{
    canonical: string | null;
    isFeatured: boolean;
    brazeValue: string | null;
  } | null>(null);
  const [testing, setTesting] = useState(false);
  const [teamMappings, setTeamMappings] = useState<TeamMapping[]>([]);
  const [featuredTeams, setFeaturedTeams] = useState<FeaturedTeam[]>([]);
  const [verifying, setVerifying] = useState(false);
  const [verificationResults, setVerificationResults] = useState<{
    attribute_verification: VerificationResult[];
    mapping_coverage: MappingCoverage[];
    issues: {
      unmapped_teams: string[];
      unverified_attributes: string[];
      error_attributes: string[];
    };
  } | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    const [mappingsRes, teamsRes] = await Promise.all([
      supabase.from('team_mappings').select('*').order('canonical_name'),
      supabase.from('featured_teams').select('team_name, braze_attribute_value'),
    ]);

    if (mappingsRes.data) setTeamMappings(mappingsRes.data);
    if (teamsRes.data) setFeaturedTeams(teamsRes.data);
  };

  const testTeam = async () => {
    if (!testTeamName.trim()) return;
    
    setTesting(true);
    try {
      const normalized = testTeamName.toLowerCase();
      
      // Find matching mapping
      let canonical: string | null = null;
      for (const mapping of teamMappings) {
        const regex = new RegExp(mapping.pattern, 'i');
        if (regex.test(normalized)) {
          canonical = mapping.canonical_name;
          break;
        }
      }

      // Check if featured
      const featured = featuredTeams.find(t => t.team_name === canonical);
      
      setTestResult({
        canonical,
        isFeatured: !!featured,
        brazeValue: featured?.braze_attribute_value || canonical,
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to test team name',
        variant: 'destructive',
      });
    } finally {
      setTesting(false);
    }
  };

  const runVerification = async () => {
    setVerifying(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast({ title: 'Error', description: 'Not authenticated', variant: 'destructive' });
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verify-braze-attributes`,
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
        throw new Error(result.error || 'Verification failed');
      }

      setVerificationResults(result);
      toast({
        title: 'Verification Complete',
        description: `Checked ${result.mapping_coverage?.length || 0} teams`,
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Verification failed',
        variant: 'destructive',
      });
    } finally {
      setVerifying(false);
    }
  };

  const hasIssues = verificationResults?.issues && (
    verificationResults.issues.unmapped_teams.length > 0 ||
    verificationResults.issues.unverified_attributes.length > 0 ||
    verificationResults.issues.error_attributes.length > 0
  );

  return (
    <CollapsibleCard
      title={
        <div className="flex items-center gap-2">
          <Settings className="h-5 w-5" />
          <span>Team Configuration Validator</span>
        </div>
      }
      description="Test team name mappings and verify Braze attribute configuration"
      defaultOpen={false}
    >
      <div className="space-y-6">
        {/* Team Name Tester */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold">Test Team Name Resolution</h3>
          <div className="flex gap-2">
            <Input
              placeholder="Enter team name (e.g., Real Madrid, Barcelona FC)"
              value={testTeamName}
              onChange={(e) => setTestTeamName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && testTeam()}
            />
            <Button onClick={testTeam} disabled={testing || !testTeamName.trim()}>
              {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            </Button>
          </div>

          {testResult && (
            <div className="rounded-lg border p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Canonical Name:</span>
                {testResult.canonical ? (
                  <Badge variant="secondary">{testResult.canonical}</Badge>
                ) : (
                  <Badge variant="destructive">No Mapping Found</Badge>
                )}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Featured Team:</span>
                {testResult.isFeatured ? (
                  <Badge className="bg-green-500">Yes</Badge>
                ) : (
                  <Badge variant="outline">No</Badge>
                )}
              </div>
              {testResult.isFeatured && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Braze Attribute Value:</span>
                  <Badge variant="secondary">{testResult.brazeValue}</Badge>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Active Mappings Summary */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Configuration Overview</h3>
            <Button variant="outline" size="sm" onClick={runVerification} disabled={verifying}>
              {verifying ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Run Verification
            </Button>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-lg bg-muted p-4 text-center">
              <div className="text-2xl font-bold">{teamMappings.length}</div>
              <div className="text-xs text-muted-foreground">Team Mappings</div>
            </div>
            <div className="rounded-lg bg-muted p-4 text-center">
              <div className="text-2xl font-bold">{featuredTeams.length}</div>
              <div className="text-xs text-muted-foreground">Featured Teams</div>
            </div>
            <div className={`rounded-lg p-4 text-center ${hasIssues ? 'bg-destructive/10' : 'bg-green-500/10'}`}>
              <div className="text-2xl font-bold">
                {hasIssues ? (
                  <AlertTriangle className="h-6 w-6 mx-auto text-destructive" />
                ) : (
                  <CheckCircle className="h-6 w-6 mx-auto text-green-500" />
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                {hasIssues ? 'Issues Found' : 'All Good'}
              </div>
            </div>
          </div>
        </div>

        {/* Verification Results */}
        {verificationResults && (
          <div className="space-y-4">
            {verificationResults.issues.unmapped_teams.length > 0 && (
              <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4">
                <h4 className="font-semibold text-destructive flex items-center gap-2">
                  <XCircle className="h-4 w-4" />
                  Unmapped Featured Teams
                </h4>
                <p className="text-sm text-muted-foreground mt-1">
                  These featured teams have no team_mapping entry. Notifications may not work correctly.
                </p>
                <div className="flex flex-wrap gap-2 mt-2">
                  {verificationResults.issues.unmapped_teams.map(team => (
                    <Badge key={team} variant="destructive">{team}</Badge>
                  ))}
                </div>
              </div>
            )}

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Team Name</TableHead>
                  <TableHead>Has Mapping</TableHead>
                  <TableHead>Braze Attribute</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {verificationResults.mapping_coverage.map((item) => {
                  const attrResult = verificationResults.attribute_verification.find(
                    a => a.team_name === item.team_name
                  );
                  return (
                    <TableRow key={item.team_name}>
                      <TableCell className="font-medium">{item.team_name}</TableCell>
                      <TableCell>
                        {item.has_mapping ? (
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        ) : (
                          <XCircle className="h-4 w-4 text-destructive" />
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {attrResult?.braze_attribute_value || '-'}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            attrResult?.status === 'verified'
                              ? 'default'
                              : attrResult?.status === 'error'
                              ? 'destructive'
                              : 'secondary'
                          }
                        >
                          {attrResult?.status || 'unknown'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </CollapsibleCard>
  );
}
