import * as React from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "./card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./collapsible";

interface CollapsibleCardProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  defaultOpen?: boolean;
  headerExtra?: React.ReactNode;
  footerContent?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function CollapsibleCard({
  title,
  description,
  defaultOpen = true,
  headerExtra,
  footerContent,
  children,
  className,
}: CollapsibleCardProps) {
  const [isOpen, setIsOpen] = React.useState(defaultOpen);

  return (
    <Card className={cn(className)}>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer select-none hover:bg-muted/30 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <CardTitle>{title}</CardTitle>
                  {headerExtra}
                </div>
                {description && <CardDescription className="mt-1.5">{description}</CardDescription>}
              </div>
              <div className="ml-4 shrink-0 text-muted-foreground transition-transform duration-200">
                {isOpen ? (
                  <ChevronUp className="h-5 w-5" />
                ) : (
                  <ChevronDown className="h-5 w-5" />
                )}
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent>{children}</CardContent>
          {footerContent && <CardFooter>{footerContent}</CardFooter>}
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
