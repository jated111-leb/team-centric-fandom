import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Download, Filter, ChevronLeft, ChevronRight } from "lucide-react";
import { formatBaghdadTime } from "@/lib/timezone";
import { useNotificationLogs } from "@/hooks/useNotificationLogs";

const getEventBadgeVariant = (eventType: string) => {
  if (eventType.includes('send') || eventType.includes('Send') || eventType.includes('sent')) return "default" as const;
  if (eventType.includes('bounce') || eventType.includes('Bounce')) return "destructive" as const;
  return "secondary" as const;
};

const NotificationLogs = () => {
  const {
    loading, logs, stats, totalCount, page, setPage, totalPages,
    filters, updateFilter, eventTypes, competitions, exportToCSV, PAGE_SIZE,
  } = useNotificationLogs();

  const [localUserId, setLocalUserId] = useState(filters.userId);

  const handleUserIdChange = (value: string) => {
    setLocalUserId(value);
    updateFilter('userId', value);
  };

  return (
    <div className="bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Notification Hub</h1>
            <p className="text-muted-foreground">Track all sent notifications in real-time</p>
          </div>
          <Button onClick={exportToCSV} disabled={logs.length === 0}>
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Total Matching</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalCount.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">across all pages</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Unique Users (this page)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.uniqueUsers}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Page</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalPages > 0 ? page + 1 : 0} / {totalPages}</div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Filter className="h-5 w-5" />
              Filters
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Date Range</label>
                <Select value={filters.dateRange} onValueChange={(v) => updateFilter('dateRange', v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="today">Today</SelectItem>
                    <SelectItem value="week">Last 7 Days</SelectItem>
                    <SelectItem value="month">Last 30 Days</SelectItem>
                    <SelectItem value="all">All Time</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">User ID</label>
                <Input
                  placeholder="Exact user ID..."
                  value={localUserId}
                  onChange={(e) => handleUserIdChange(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">Event Type</label>
                <Select value={filters.eventType} onValueChange={(v) => updateFilter('eventType', v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Events</SelectItem>
                    {eventTypes.map(type => (
                      <SelectItem key={type} value={type}>{type}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">Competition</label>
                <Select value={filters.competition} onValueChange={(v) => updateFilter('competition', v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Competitions</SelectItem>
                    {competitions.map(comp => (
                      <SelectItem key={comp} value={comp}>{comp}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Logs Table */}
        <Card>
          <CardHeader>
            <CardTitle>Notification Sends ({totalCount.toLocaleString()})</CardTitle>
            <CardDescription>
              Showing {logs.length} results (page {totalPages > 0 ? page + 1 : 0} of {totalPages})
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8">Loading...</div>
            ) : (
              <>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>User ID</TableHead>
                        <TableHead>Event Type</TableHead>
                        <TableHead>Match</TableHead>
                        <TableHead>Competition</TableHead>
                        <TableHead>Sent At (Baghdad)</TableHead>
                        <TableHead>Match ID</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {logs.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                            No notification logs found
                          </TableCell>
                        </TableRow>
                      ) : (
                        logs.map((log) => (
                          <TableRow key={log.id}>
                            <TableCell className="font-mono text-sm">
                              {log.external_user_id || 'N/A'}
                            </TableCell>
                            <TableCell>
                              <Badge variant={getEventBadgeVariant(log.braze_event_type)}>
                                {log.braze_event_type}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {log.home_team && log.away_team ? (
                                <span className="text-sm">{log.home_team} vs {log.away_team}</span>
                              ) : (
                                <span className="text-muted-foreground">N/A</span>
                              )}
                            </TableCell>
                            <TableCell>
                              {log.competition || <span className="text-muted-foreground">N/A</span>}
                            </TableCell>
                            <TableCell className="text-sm">
                              {formatBaghdadTime(new Date(log.sent_at))}
                            </TableCell>
                            <TableCell className="font-mono text-sm">
                              {log.match_id || 'N/A'}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between mt-4">
                    <p className="text-sm text-muted-foreground">
                      {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, totalCount)} of {totalCount.toLocaleString()}
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage(p => p - 1)}
                        disabled={page === 0}
                      >
                        <ChevronLeft className="h-4 w-4" />
                        Previous
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage(p => p + 1)}
                        disabled={page >= totalPages - 1}
                      >
                        Next
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default NotificationLogs;
