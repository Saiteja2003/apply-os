import { Badge } from "@/components/ui/badge";

export function MatchScore({ score }: { score: number | null }) {
  if (score === null) return null;
  const variant = score >= 80 ? "success" : score >= 60 ? "warning" : "neutral";
  return (
    <Badge variant={variant} className="tabular-nums" title="ATS keyword match">
      {score}%
    </Badge>
  );
}
