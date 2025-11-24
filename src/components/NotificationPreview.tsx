import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Bell } from 'lucide-react';
import { formatInTimeZone, toZonedTime } from 'date-fns-tz';

export const NotificationPreview = () => {
  const [open, setOpen] = useState(false);

  // Create sample notification data
  const generateSampleNotification = () => {
    const now = new Date();
    const kickoffDate = new Date(now.getTime() + 90 * 60 * 1000); // 90 minutes from now
    const BAGHDAD_TIMEZONE = 'Asia/Baghdad';
    const baghdadTime = toZonedTime(kickoffDate, BAGHDAD_TIMEZONE);

    // Helper to convert digits to Arabic numerals
    const toArabicDigits = (str: string) => {
      const arabicDigits = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
      return str.replace(/\d/g, (d) => arabicDigits[parseInt(d)]);
    };

    // Format kickoff_ar: "الساعة ٨:٠٠ م ٢٥-١١-٢٠٢٥ (توقيت بغداد)"
    const hours24 = baghdadTime.getHours();
    const minutes = baghdadTime.getMinutes();
    const hours12 = hours24 % 12 || 12;
    const ampm = hours24 < 12 ? 'ص' : 'م';
    const day = baghdadTime.getDate();
    const month = baghdadTime.getMonth() + 1;
    const year = baghdadTime.getFullYear();

    const timeStr = `${hours12}:${minutes.toString().padStart(2, '0')}`;
    const dateStr = `${day.toString().padStart(2, '0')}-${month.toString().padStart(2, '0')}-${year}`;
    const kickoff_ar = toArabicDigits(`الساعة ${timeStr} ${ampm} ${dateStr} (توقيت بغداد)`);

    // Format kickoff_baghdad: "YYYY-MM-DD HH:MM" in Baghdad timezone
    const kickoff_baghdad = formatInTimeZone(kickoffDate, BAGHDAD_TIMEZONE, 'yyyy-MM-dd HH:mm');

    return {
      home_en: 'Real Madrid CF',
      away_en: 'FC Barcelona',
      home_ar: 'ريال مدريد',
      away_ar: 'برشلونة',
      competition_en: 'LaLiga',
      competition_ar: 'الدوري الإسباني',
      kickoff_ar,
      kickoff_baghdad,
    };
  };

  const sample = generateSampleNotification();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Bell className="h-4 w-4 mr-2" />
          Preview Notification
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Notification Preview</DialogTitle>
          <DialogDescription>
            This is how the notification content will appear to users
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* English Version */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">English Notification</CardTitle>
              <CardDescription>How it appears for English users</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-lg bg-muted p-4 space-y-2">
                <p className="font-semibold text-sm">⚽ Match Alert</p>
                <p className="text-sm">
                  <span className="font-medium">{sample.home_en}</span> vs{' '}
                  <span className="font-medium">{sample.away_en}</span>
                </p>
                <p className="text-xs text-muted-foreground">{sample.competition_en}</p>
                <p className="text-xs text-muted-foreground">Kickoff: {sample.kickoff_baghdad}</p>
              </div>
            </CardContent>
          </Card>

          {/* Arabic Version */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Arabic Notification</CardTitle>
              <CardDescription>How it appears for Arabic users</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-lg bg-muted p-4 space-y-2" dir="rtl">
                <p className="font-semibold text-sm">⚽ تنبيه المباراة</p>
                <p className="text-sm">
                  <span className="font-medium">{sample.home_ar}</span> ضد{' '}
                  <span className="font-medium">{sample.away_ar}</span>
                </p>
                <p className="text-xs text-muted-foreground">{sample.competition_ar}</p>
                <p className="text-xs text-muted-foreground">{sample.kickoff_ar}</p>
              </div>
            </CardContent>
          </Card>

          {/* Technical Details */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Technical Details</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div className="grid grid-cols-2 gap-2">
                  <span className="text-muted-foreground">Timing:</span>
                  <span className="font-mono">60 min before kickoff</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <span className="text-muted-foreground">Timezone:</span>
                  <span className="font-mono">Baghdad Time (Asia/Baghdad)</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <span className="text-muted-foreground">Delivery:</span>
                  <span className="font-mono">UTC-based (simultaneous worldwide)</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <span className="text-muted-foreground">Audience:</span>
                  <span className="font-mono">Team 1/2/3 attributes</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
};
