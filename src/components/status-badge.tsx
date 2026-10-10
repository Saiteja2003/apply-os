import type { ApplicationStatus } from "@/lib/types/resume";

import { Badge, type BadgeProps } from "@/components/ui/badge";

export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  SAVED: "Saved",
  APPLIED: "Applied",
  INTERVIEWING: "Interviewing",
  REJECTED: "Rejected",
  OFFER: "Offer",
};

const STATUS_VARIANTS: Record<ApplicationStatus, BadgeProps["variant"]> = {
  SAVED: "neutral",
  APPLIED: "accent",
  INTERVIEWING: "warning",
  REJECTED: "danger",
  OFFER: "success",
};

export function StatusBadge({ status }: { status: ApplicationStatus }) {
  return (
    <Badge variant={STATUS_VARIANTS[status]}>{STATUS_LABELS[status]}</Badge>
  );
}
