import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export const StatusBadge = ({ status, className }: StatusBadgeProps) => {
  const isLive = status === "LIVE" || status === "IN_PLAY";
  const isFinished = status === "FINISHED";
  
  return (
    <Badge
      variant={isLive ? "default" : "secondary"}
      className={cn(
        "font-medium",
        isLive && "bg-status-live text-white animate-pulse",
        isFinished && "bg-status-finished text-white",
        !isLive && !isFinished && "bg-status-scheduled text-white",
        className
      )}
    >
      {status}
    </Badge>
  );
};
