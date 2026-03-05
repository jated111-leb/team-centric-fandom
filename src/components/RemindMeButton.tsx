import { useState } from 'react';
import { Bell, BellRing, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { useGameReminder } from '@/hooks/useGameReminder';
import { toast } from 'sonner';

interface RemindMeButtonProps {
  matchId: string;
  matchDate: string; // ISO UTC string — used to hide button for past matches
}

export function RemindMeButton({ matchId, matchDate }: RemindMeButtonProps) {
  const [open, setOpen] = useState(false);
  const [externalUserId, setExternalUserId] = useState('');
  const { isReminded, setReminder } = useGameReminder(matchId);

  // Only show for future matches
  if (!matchDate || new Date(matchDate) <= new Date()) return null;

  const handleSubmit = async () => {
    const userId = externalUserId.trim();
    if (!userId) return;
    try {
      await setReminder.mutateAsync(userId);
      setOpen(false);
      setExternalUserId('');
      toast.success('Reminder set', {
        description: 'A push notification will be sent 30 min before kickoff.',
      });
    } catch {
      toast.error('Failed to set reminder — check console for details.');
    }
  };

  if (isReminded) {
    return (
      <Button variant="ghost" size="sm" disabled className="gap-1 text-green-600 cursor-default">
        <BellRing className="h-3.5 w-3.5" />
        <span className="text-xs">Set</span>
      </Button>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1 text-muted-foreground hover:text-foreground"
        >
          <Bell className="h-3.5 w-3.5" />
          <span className="text-xs">Remind</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="end">
        <p className="text-xs font-medium mb-1">Set game reminder</p>
        <p className="text-xs text-muted-foreground mb-2">
          Enter a Braze external user ID — the notification fires 30 min before kickoff.
        </p>
        <Input
          placeholder="braze-external-user-id"
          value={externalUserId}
          onChange={(e) => setExternalUserId(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          className="h-8 text-sm mb-2"
        />
        <Button
          size="sm"
          className="w-full h-8"
          onClick={handleSubmit}
          disabled={!externalUserId.trim() || setReminder.isPending}
        >
          {setReminder.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            'Set Reminder'
          )}
        </Button>
      </PopoverContent>
    </Popover>
  );
}
