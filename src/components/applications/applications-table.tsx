"use client";

import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Download,
  ExternalLink,
  Search,
  X,
} from "lucide-react";
import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import { MatchScore } from "@/components/match-score";
import { StatusBadge, STATUS_LABELS } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { exportApplicationsToCsv } from "@/lib/export/csv";
import {
  APPLICATION_STATUSES,
  type ApplicationStatus,
  type JobApplication,
} from "@/lib/types/resume";
import { formatDate } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

type SortKey =
  | "company"
  | "status"
  | "matchScore"
  | "appliedAt"
  | "createdAt";

type SortDirection = "asc" | "desc";

interface SortState {
  key: SortKey;
  direction: SortDirection;
}

const STATUS_ORDER: Record<ApplicationStatus, number> = {
  SAVED: 0,
  APPLIED: 1,
  INTERVIEWING: 2,
  OFFER: 3,
  REJECTED: 4,
};

function compareApplications(
  a: JobApplication,
  b: JobApplication,
  sort: SortState,
): number {
  const dir = sort.direction === "asc" ? 1 : -1;

  switch (sort.key) {
    case "company": {
      const cmp =
        a.companyName.localeCompare(b.companyName) ||
        a.roleTitle.localeCompare(b.roleTitle);
      return cmp * dir;
    }
    case "status":
      return (STATUS_ORDER[a.status] - STATUS_ORDER[b.status]) * dir;
    case "matchScore": {
      const scoreA = a.matchScore ?? -1;
      const scoreB = b.matchScore ?? -1;
      return (scoreA - scoreB) * dir;
    }
    case "appliedAt": {
      const dateA = a.appliedAt ?? "";
      const dateB = b.appliedAt ?? "";
      return dateA.localeCompare(dateB) * dir;
    }
    case "createdAt":
      return a.createdAt.localeCompare(b.createdAt) * dir;
  }
}

function cycleSort(
  current: SortState | null,
  key: SortKey,
): SortState | null {
  if (current?.key !== key) {
    // Default directions: match score descending, dates descending, rest ascending
    const defaultDir: SortDirection =
      key === "matchScore" || key === "appliedAt" || key === "createdAt"
        ? "desc"
        : "asc";
    return { key, direction: defaultDir };
  }
  if (current.direction === "asc") return { key, direction: "desc" };
  if (current.direction === "desc" && (key === "matchScore" || key === "appliedAt" || key === "createdAt")) {
    return { key, direction: "asc" };
  }
  if (current.direction === "desc") return { key, direction: "asc" };
  // Reset
  return null;
}

// ---------------------------------------------------------------------------
// Column header
// ---------------------------------------------------------------------------

function SortableHeader({
  label,
  sortKey,
  sort,
  onSort,
  className = "",
}: {
  label: string;
  sortKey: SortKey;
  sort: SortState | null;
  onSort: (key: SortKey) => void;
  className?: string;
}) {
  const active = sort?.key === sortKey;
  const Icon = active
    ? sort.direction === "asc"
      ? ArrowUp
      : ArrowDown
    : ArrowUpDown;

  return (
    <th className={`px-4 py-2.5 font-medium ${className}`}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="group/sort inline-flex items-center gap-1 rounded outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {label}
        <Icon
          className={`size-3 transition-colors duration-150 ${
            active
              ? "text-zinc-200"
              : "text-zinc-600 group-hover/sort:text-zinc-400"
          }`}
          aria-hidden
        />
      </button>
    </th>
  );
}

// ---------------------------------------------------------------------------
// Filter pill
// ---------------------------------------------------------------------------

type StatusFilter = "ALL" | ApplicationStatus;

function FilterPill({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        active
          ? "bg-zinc-700/80 text-zinc-100"
          : "text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200"
      }`}
    >
      {label}
      <span
        className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${
          active
            ? "bg-zinc-600/80 text-zinc-200"
            : "bg-zinc-800/80 text-zinc-500"
        }`}
      >
        {count}
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface ApplicationsTableProps {
  applications: JobApplication[];
  onRowClick: (applicationId: string) => void;
}

export function ApplicationsTable({
  applications,
  onRowClick,
}: ApplicationsTableProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [sort, setSort] = useState<SortState | null>(null);
  const [focusedIndex, setFocusedIndex] = useState(-1);

  const tbodyRef = useRef<HTMLTableSectionElement>(null);

  // ---- Status counts (computed before search to show global counts) ----
  const statusCounts = useMemo(() => {
    const counts: Record<StatusFilter, number> = {
      ALL: applications.length,
      SAVED: 0,
      APPLIED: 0,
      INTERVIEWING: 0,
      OFFER: 0,
      REJECTED: 0,
    };
    for (const app of applications) {
      counts[app.status]++;
    }
    return counts;
  }, [applications]);

  // ---- Filter + sort pipeline ----
  const filteredApplications = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();

    let result = applications;

    // Status filter
    if (statusFilter !== "ALL") {
      result = result.filter((app) => app.status === statusFilter);
    }

    // Search filter
    if (query) {
      result = result.filter((app) => {
        const haystack = [
          app.companyName,
          app.roleTitle,
          app.location ?? "",
          ...app.atsKeywords.matched,
          ...app.atsKeywords.missing,
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(query);
      });
    }

    // Sort
    if (sort) {
      result = [...result].sort((a, b) => compareApplications(a, b, sort));
    }

    return result;
  }, [applications, searchQuery, statusFilter, sort]);

  const handleSort = useCallback(
    (key: SortKey) => setSort((current) => cycleSort(current, key)),
    [],
  );

  // ---- Keyboard navigation ----
  const handleTableKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTableSectionElement>) => {
      const rows = filteredApplications;
      if (rows.length === 0) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocusedIndex((prev) => Math.min(prev + 1, rows.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === "Enter" && focusedIndex >= 0 && focusedIndex < rows.length) {
        e.preventDefault();
        onRowClick(rows[focusedIndex].id);
      }
    },
    [filteredApplications, focusedIndex, onRowClick],
  );

  // Scroll focused row into view
  const focusedRowRef = useCallback(
    (node: HTMLTableRowElement | null) => {
      node?.scrollIntoView({ block: "nearest" });
    },
    [],
  );

  const handleExport = useCallback(() => {
    exportApplicationsToCsv(filteredApplications);
  }, [filteredApplications]);

  return (
    <div className="space-y-3">
      {/* ---- Toolbar: Search + Export ---- */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 sm:max-w-sm">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500"
            aria-hidden
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setFocusedIndex(-1);
            }}
            placeholder="Search company, role, location, keywords…"
            className="w-full rounded-lg border border-zinc-800/80 bg-zinc-900/60 py-2 pl-9 pr-9 text-sm text-zinc-100 placeholder:text-zinc-500 outline-none transition-colors duration-150 focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setFocusedIndex(-1);
              }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-zinc-500 transition-colors hover:text-zinc-300 outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Clear search"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={handleExport}
          disabled={filteredApplications.length === 0}
          className="inline-flex items-center gap-2 rounded-lg border border-zinc-800/80 bg-zinc-900/60 px-3.5 py-2 text-sm font-medium text-zinc-300 transition-colors duration-150 hover:bg-zinc-800/60 hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Download className="size-4" aria-hidden />
          Export CSV
        </button>
      </div>

      {/* ---- Status filter pills ---- */}
      <div className="flex flex-wrap items-center gap-1">
        <FilterPill
          label="All"
          count={statusCounts.ALL}
          active={statusFilter === "ALL"}
          onClick={() => {
            setStatusFilter("ALL");
            setFocusedIndex(-1);
          }}
        />
        {APPLICATION_STATUSES.map((status) => (
          <FilterPill
            key={status}
            label={STATUS_LABELS[status]}
            count={statusCounts[status]}
            active={statusFilter === status}
            onClick={() => {
              setStatusFilter(status);
              setFocusedIndex(-1);
            }}
          />
        ))}
      </div>

      {/* ---- Data grid ---- */}
      {filteredApplications.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-800 px-4 py-12 text-center">
          <p className="text-sm font-medium">
            {applications.length === 0
              ? "No applications yet"
              : "No applications match your filters"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {applications.length === 0
              ? "Add your first job from the dashboard."
              : "Try adjusting your search or status filter."}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-800/80 bg-zinc-900/60">
          <table className="w-full min-w-[880px] text-left text-sm">
            <thead className="border-b border-zinc-800/80 text-xs text-zinc-400">
              <tr>
                <SortableHeader
                  label="Company & Role"
                  sortKey="company"
                  sort={sort}
                  onSort={handleSort}
                />
                <SortableHeader
                  label="Status"
                  sortKey="status"
                  sort={sort}
                  onSort={handleSort}
                />
                <SortableHeader
                  label="Match"
                  sortKey="matchScore"
                  sort={sort}
                  onSort={handleSort}
                  className="text-right"
                />
                <th className="px-4 py-2.5 font-medium">Keywords</th>
                <SortableHeader
                  label="Applied"
                  sortKey="appliedAt"
                  sort={sort}
                  onSort={handleSort}
                />
                <SortableHeader
                  label="Added"
                  sortKey="createdAt"
                  sort={sort}
                  onSort={handleSort}
                />
                <th className="w-8" aria-hidden />
              </tr>
            </thead>
            <tbody
              ref={tbodyRef}
              onKeyDown={handleTableKeyDown}
              tabIndex={0}
              className="outline-none"
            >
              {filteredApplications.map((app, index) => {
                const isFocused = index === focusedIndex;
                const matchedCount = app.atsKeywords.matched.length;
                const missingCount = app.atsKeywords.missing.length;

                return (
                  <tr
                    key={app.id}
                    ref={isFocused ? focusedRowRef : undefined}
                    onClick={() => onRowClick(app.id)}
                    className={`group cursor-pointer border-b border-zinc-800/60 transition-colors duration-150 last:border-0 ${
                      isFocused
                        ? "bg-zinc-800/50"
                        : "hover:bg-zinc-800/40"
                    }`}
                    aria-selected={isFocused}
                  >
                    {/* Company & Role */}
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium text-zinc-100 transition-colors duration-150 group-hover:text-indigo-300">
                              {app.companyName}
                            </span>
                            {app.jobUrl && (
                              <a
                                href={app.jobUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="flex-shrink-0 rounded p-0.5 text-zinc-600 transition-colors duration-150 hover:text-indigo-400 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                title="Open job posting"
                              >
                                <ExternalLink className="size-3" aria-hidden />
                              </a>
                            )}
                          </div>
                          <p className="truncate text-xs text-zinc-400">
                            {app.roleTitle}
                            {app.location && (
                              <span className="text-zinc-600">
                                {" · "}
                                {app.location}
                              </span>
                            )}
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* Status */}
                    <td className="px-4 py-2.5">
                      <StatusBadge status={app.status} />
                    </td>

                    {/* Match Score */}
                    <td className="px-4 py-2.5 text-right">
                      {app.matchScore === null ? (
                        <span className="text-muted-foreground">–</span>
                      ) : (
                        <MatchScore score={app.matchScore} />
                      )}
                    </td>

                    {/* Keywords */}
                    <td className="px-4 py-2.5">
                      {matchedCount > 0 || missingCount > 0 ? (
                        <div className="flex items-center gap-1.5">
                          {matchedCount > 0 && (
                            <Badge variant="success" className="tabular-nums">
                              {matchedCount} matched
                            </Badge>
                          )}
                          {missingCount > 0 && (
                            <Badge variant="danger" className="tabular-nums">
                              {missingCount} missing
                            </Badge>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">–</span>
                      )}
                    </td>

                    {/* Applied Date */}
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {app.appliedAt ? formatDate(app.appliedAt) : "–"}
                    </td>

                    {/* Created Date */}
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {formatDate(app.createdAt)}
                    </td>

                    {/* Chevron (reserved width for visual affordance) */}
                    <td className="pr-3 text-zinc-600 transition-colors duration-150 group-hover:text-zinc-300">
                      <svg
                        className="size-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                        aria-hidden
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M9 5l7 7-7 7"
                        />
                      </svg>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ---- Footer: row count ---- */}
      {applications.length > 0 && (
        <p className="text-xs text-zinc-500 tabular-nums">
          {filteredApplications.length === applications.length
            ? `${applications.length} application${applications.length === 1 ? "" : "s"}`
            : `${filteredApplications.length} of ${applications.length} application${applications.length === 1 ? "" : "s"}`}
        </p>
      )}
    </div>
  );
}
