import type { EmailIntent } from "@/lib/inbound/email";

export type { EmailIntent };

/** A recruiter email received for an application, with its reply draft. */
export interface EmailInteraction {
  id: string;
  applicationId: string;
  sender: string;
  senderName: string | null;
  subject: string;
  bodyText: string;
  intent: EmailIntent;
  /** A reply for the user to review and send themselves; never sent by ApplyOS. */
  draftResponse: string | null;
  receivedAt: string;
  createdAt: string;
}
