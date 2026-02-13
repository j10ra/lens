import { Badge, Card, CardAction, CardDescription, CardFooter, CardHeader, CardTitle, cn } from "@lens/ui";

interface StatsCardProps {
  label: string;
  value: string | number;
  description?: string;
  trend?: string;
  className?: string;
}

export function StatsCard({ label, value, description, trend, className }: StatsCardProps) {
  return (
    <Card className={cn("@container/card", className)}>
      <CardHeader className="relative">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">{value}</CardTitle>
        {trend && (
          <CardAction>
            <Badge variant="outline" className="rounded-lg text-xs">
              {trend}
            </Badge>
          </CardAction>
        )}
      </CardHeader>
      {description && (
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="text-muted-foreground">{description}</div>
        </CardFooter>
      )}
    </Card>
  );
}
