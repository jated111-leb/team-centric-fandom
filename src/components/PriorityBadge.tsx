import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface PriorityBadgeProps {
  priority: "High" | "Medium" | "Low";
  className?: string;
}

export const PriorityBadge = ({ priority, className }: PriorityBadgeProps) => {
  return (
    <Badge
      variant="outline"
      className={cn(
        "font-semibold border-2",
        priority === "High" && "bg-priority-high/10 text-priority-high border-priority-high/50",
        priority === "Medium" && "bg-priority-medium/10 text-priority-medium border-priority-medium/50",
        priority === "Low" && "bg-priority-low/10 text-priority-low border-priority-low/50",
        className
      )}
    >
      {priority}
    </Badge>
  );
};
