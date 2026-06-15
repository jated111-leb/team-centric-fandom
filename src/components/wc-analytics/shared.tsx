import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ReactNode } from 'react';

// 10-shade green ramp aligned with the brand (Verdant Green base).
export const GREEN_RAMP = [
  '#13CB5C', '#1FE16C', '#3EEB85', '#5FF099', '#82F4AD',
  '#0FA64B', '#0C8C3F', '#0A7635', '#08612C', '#064D23',
];

// Distinct palette for categorical breakdowns.
export const CATEGORY_COLORS = [
  '#13CB5C', '#3B82F6', '#F59E0B', '#A855F7', '#EC4899',
  '#10B981', '#06B6D4', '#F97316', '#EF4444', '#84CC16',
];

export const STAGE_LABELS: Record<string, string> = {
  GROUP_STAGE: 'Group Stage',
  LAST_32: 'Round of 32',
  LAST_16: 'Round of 16',
  QUARTER_FINALS: 'Quarter-Finals',
  SEMI_FINALS: 'Semi-Finals',
  THIRD_PLACE: 'Third Place',
  FINAL: 'Final',
  FRIENDLY: 'Friendly',
};

export function Kpi({
  label,
  value,
  sub,
  icon,
  tone = 'default',
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon?: ReactNode;
  tone?: 'default' | 'success' | 'warn' | 'destructive';
}) {
  const toneClass =
    tone === 'success' ? 'text-primary'
    : tone === 'warn' ? 'text-yellow-500'
    : tone === 'destructive' ? 'text-destructive'
    : 'text-muted-foreground';
  return (
    <Card>
      <CardContent className="p-4">
        <div className={`flex items-center gap-2 text-xs ${toneClass}`}>
          {icon && <span className="[&>svg]:h-4 [&>svg]:w-4">{icon}</span>}
          <span>{label}</span>
        </div>
        <div className="text-2xl font-bold mt-1.5">{value}</div>
        {sub && <div className="text-[11px] text-muted-foreground mt-1">{sub}</div>}
      </CardContent>
    </Card>
  );
}

export function ChartCard({
  title,
  desc,
  children,
  action,
}: {
  title: string;
  desc?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
        <div>
          <CardTitle className="text-base">{title}</CardTitle>
          {desc && <CardDescription className="text-xs">{desc}</CardDescription>}
        </div>
        {action}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="h-[260px] flex items-center justify-center text-sm text-muted-foreground border border-dashed border-border rounded-md">
      {message}
    </div>
  );
}

export function downloadCsv(filename: string, rows: Record<string, any>[]) {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const escape = (v: any) => {
    if (v == null) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers.join(','), ...rows.map((r) => headers.map((h) => escape(r[h])).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
