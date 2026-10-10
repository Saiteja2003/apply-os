import type {
  ExperienceOverride,
  MasterResume,
  PatchDocument,
  ResumeExperience,
} from "@/lib/types/resume";
import { ArrowUp } from "lucide-react";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { diffWords, type DiffToken } from "@/lib/diff";
import { cn } from "@/lib/utils";

interface ResumeDiffViewerProps {
  master: MasterResume;
  patch: PatchDocument;
}

interface BulletRow {
  id: string;
  original: string;
  tailored: string | null;
  promoted: boolean;
}

/** Bullets in tailored display order: promoted first, the rest in master order. */
function buildRows(
  experience: ResumeExperience,
  override: ExperienceOverride,
): BulletRow[] {
  const adapted = new Map(
    override.adaptedBullets.map((bullet) => [bullet.id, bullet.text]),
  );
  const byId = new Map(experience.bullets.map((bullet) => [bullet.id, bullet]));
  const promoted = override.promotedBulletIds.filter((id) => byId.has(id));
  const rest = experience.bullets
    .map((bullet) => bullet.id)
    .filter((id) => !promoted.includes(id));

  return [...promoted, ...rest].map((id) => ({
    id,
    original: byId.get(id)!.text,
    tailored: adapted.get(id) ?? null,
    promoted: promoted.includes(id),
  }));
}

function Tokens({
  tokens,
  tone,
}: {
  tokens: DiffToken[];
  tone: "removed" | "added";
}) {
  return (
    <>
      {tokens.map((token, index) => (
        <span key={index}>
          {index > 0 && " "}
          <span
            className={cn(
              token.changed && "rounded-sm px-0.5",
              token.changed &&
                tone === "removed" &&
                "text-zinc-500 line-through decoration-zinc-600",
              token.changed &&
                tone === "added" &&
                "bg-emerald-500/15 text-emerald-300",
            )}
          >
            {token.text}
          </span>
        </span>
      ))}
    </>
  );
}

function DiffRow({
  id,
  original,
  tailored,
  badges,
}: {
  /** Stable master id of the node this row shows. */
  id?: string;
  original: string;
  tailored: string | null;
  badges?: ReactNode;
}) {
  const diff = tailored === null ? null : diffWords(original, tailored);

  return (
    <div className="grid grid-cols-1 border-t first:border-t-0 sm:grid-cols-2">
      <div className="px-3 py-2.5">
        <p className="text-sm leading-relaxed text-muted-foreground">
          {diff ? <Tokens tokens={diff.original} tone="removed" /> : original}
        </p>
        {id && (
          <p className="mt-1.5 font-mono text-[11px] text-muted-foreground/70">
            {id}
          </p>
        )}
      </div>
      <div className="border-t px-3 py-2.5 sm:border-t-0 sm:border-l">
        <p className="text-sm leading-relaxed">
          {diff ? <Tokens tokens={diff.tailored} tone="added" /> : original}
        </p>
        {badges && <div className="mt-1.5 flex flex-wrap gap-1">{badges}</div>}
      </div>
    </div>
  );
}

function DiffGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-lg border border-zinc-800/80 bg-zinc-900/60">
      <p className="border-b border-zinc-800/80 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-300">
        {title}
      </p>
      {children}
    </div>
  );
}

export function ResumeDiffViewer({ master, patch }: ResumeDiffViewerProps) {
  const { summary, highlightedSkills, experienceOverrides } =
    patch.modifications;

  return (
    <div className="space-y-3">
      <div className="hidden grid-cols-2 px-3 text-xs font-medium text-muted-foreground sm:grid">
        <span>Original (master)</span>
        <span className="pl-3">ATS-tailored</span>
      </div>

      {summary !== null && (
        <DiffGroup title="Summary">
          <DiffRow original={master.summary} tailored={summary} />
        </DiffGroup>
      )}

      {experienceOverrides.map((override) => {
        const experience = master.experience.find(
          (entry) => entry.id === override.experienceId,
        );
        if (!experience) return null;
        return (
          <DiffGroup
            key={override.experienceId}
            title={`${experience.title} · ${experience.company}`}
          >
            {buildRows(experience, override).map((row) => (
              <DiffRow
                key={row.id}
                id={row.id}
                original={row.original}
                tailored={row.tailored}
                badges={
                  (row.promoted || row.tailored !== null) && (
                    <>
                      {row.promoted && (
                        <Badge variant="accent">
                          <ArrowUp className="size-3" aria-hidden />
                          Moved up
                        </Badge>
                      )}
                      {row.tailored !== null && (
                        <Badge variant="success">Reworded</Badge>
                      )}
                    </>
                  )
                }
              />
            ))}
          </DiffGroup>
        );
      })}

      {highlightedSkills.length > 0 && (
        <DiffGroup title="Highlighted skills">
          <div className="flex flex-wrap gap-1.5 px-3 py-2.5">
            {highlightedSkills.map((skill) => (
              <Badge key={skill} variant="neutral">
                {skill}
              </Badge>
            ))}
          </div>
        </DiffGroup>
      )}
    </div>
  );
}
