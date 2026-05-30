"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Monogram } from "@/components/ui/monogram";
import { Popover } from "@/components/ui/popover";
import { STATUSES, STATUS_META, StatusPill } from "@/components/ui/status-pill";
import { Toast } from "@/components/ui/toast";
import type { TrackerRow } from "@/lib/types";

type FilterState = {
  statuses: string[];
  dateRange: "all" | "today" | "7d" | "30d" | "90d";
  company: string;
  scoreMin: number;
  scoreMax: number;
};

type DocPayload = {
  kind: "jd" | "cl" | "resume" | "diff";
  row: TrackerRow;
} | null;

export default function TrackerClient({
  initialRows,
  masterResumeFile,
}: {
  initialRows: TrackerRow[];
  masterResumeFile: string;
}) {
  const TRACKER_ROWS = initialRows;
  const [filters, setFilters] = useState<FilterState>({
    statuses: [],
    dateRange: "all",
    company: "",
    scoreMin: 0,
    scoreMax: 100,
  });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [docPayload, setDocPayload] = useState<DocPayload>(null);
  const [toast, setToast] = useState<{ open: boolean; message: string; kind: "info" | "success" | "error" }>(
    { open: false, message: "", kind: "info" },
  );

  const filteredRows = useMemo(() => {
    return TRACKER_ROWS.filter((r) => {
      if (filters.statuses.length && !filters.statuses.includes(r.status)) return false;
      if (filters.company && !r.company.name.toLowerCase().includes(filters.company.toLowerCase())) return false;
      if (r.matchScore < filters.scoreMin || r.matchScore > filters.scoreMax) return false;
      if (filters.dateRange !== "all") {
        const days = (Date.now() - r.appliedAt.getTime()) / 86400000;
        const cap = { today: 1, "7d": 7, "30d": 30, "90d": 90 }[filters.dateRange];
        if (days > cap) return false;
      }
      return true;
    });
  }, [filters]);

  const onExport = () =>
    setToast({ open: true, message: `Exporting ${TRACKER_ROWS.length} applications to Excel…`, kind: "info" });

  // Most recent row dictates the "last updated" line — that's the most truthful
  // signal here without a server-side queue heartbeat.
  const lastUpdated = TRACKER_ROWS[0]?.appliedAt ?? null;

  return (
    <div className="min-h-screen text-ink pb-24">
      <div className="max-w-[1280px] mx-auto px-5 sm:px-8">
        <PageHeader
          total={TRACKER_ROWS.length}
          lastUpdated={lastUpdated}
          onExport={onExport}
        />

        {TRACKER_ROWS.length === 0 ? (
          <EmptyTracker />
        ) : (
          <>
            <FiltersBar
              filters={filters}
              setFilters={setFilters}
              totalShown={filteredRows.length}
              totalAll={TRACKER_ROWS.length}
            />
            <TrackerTable
              rows={filteredRows}
              selected={selected}
              setSelected={setSelected}
              onOpenDoc={(p) => setDocPayload(p)}
              onOpenRow={(row) => setDocPayload({ kind: "diff", row })}
            />
          </>
        )}
      </div>

      <BulkBar
        count={selected.size}
        onClear={() => setSelected(new Set())}
        onExport={() =>
          setToast({
            open: true,
            message: `Exporting ${selected.size} application${selected.size > 1 ? "s" : ""}…`,
            kind: "info",
          })
        }
        onArchive={() =>
          setToast({ open: true, message: `Archived ${selected.size}`, kind: "info" })
        }
      />

      <DocDrawer
        open={!!docPayload}
        onClose={() => setDocPayload(null)}
        payload={docPayload}
        masterResumeFile={masterResumeFile}
      />

      <Toast
        open={toast.open}
        message={toast.message}
        kind={toast.kind}
        onClose={() => setToast((t) => ({ ...t, open: false }))}
      />
    </div>
  );
}

function fmtLastUpdated(d: Date | null): string {
  if (!d) return "never";
  const diffMs = Date.now() - d.getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  return `${days}d ago`;
}

/* ---------------- Page header ---------------- */

function PageHeader({
  total,
  lastUpdated,
  onExport,
}: {
  total: number;
  lastUpdated: Date | null;
  onExport: () => void;
}) {
  return (
    <div className="pt-9 pb-5">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-teal-600 mb-3">
            Tracker
          </p>
          <h1
            className="font-display font-black text-ink"
            style={{ fontSize: "clamp(2rem, 3vw, 2.7rem)", lineHeight: 1.05, letterSpacing: "-0.03em" }}
          >
            Application Tracker
          </h1>
          <p className="text-[14px] text-ink-mute mt-2.5">
            <span className="tabular text-ink">{total}</span> application{total === 1 ? "" : "s"} ·
            Last updated <span className="tabular">{fmtLastUpdated(lastUpdated)}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onExport}
            className="inline-flex items-center gap-2 rounded-full bg-white hover:bg-sand-50 border border-sand-200 text-ink text-[13px] font-semibold px-4 py-2 transition-colors"
          >
            <Icon name="download" size={14} /> Export
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Filters bar ---------------- */

function FiltersBar({
  filters,
  setFilters,
  totalShown,
  totalAll,
}: {
  filters: FilterState;
  setFilters: React.Dispatch<React.SetStateAction<FilterState>>;
  totalShown: number;
  totalAll: number;
}) {
  const toggleStatus = (s: string) => {
    setFilters((f) => {
      const has = f.statuses.includes(s);
      return { ...f, statuses: has ? f.statuses.filter((x) => x !== s) : [...f.statuses, s] };
    });
  };
  const clear = () =>
    setFilters({ statuses: [], dateRange: "all", company: "", scoreMin: 0, scoreMax: 100 });
  const hasFilter =
    filters.statuses.length > 0 ||
    filters.dateRange !== "all" ||
    filters.company !== "" ||
    filters.scoreMin > 0 ||
    filters.scoreMax < 100;

  const dateLabel = {
    all: "All dates",
    today: "Today",
    "7d": "Last 7 days",
    "30d": "Last 30 days",
    "90d": "Last 90 days",
  }[filters.dateRange];

  return (
    <div className="bg-white border border-line rounded-card shadow-subtle">
      <div className="px-4 py-3 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          {STATUSES.map((s) => {
            const active = filters.statuses.includes(s);
            const m = STATUS_META[s];
            return (
              <button
                key={s}
                onClick={() => toggleStatus(s)}
                className={`h-7 inline-flex items-center gap-1.5 px-2 rounded-full text-[12px] font-medium border transition-colors focus-ring ${
                  active
                    ? "border-transparent"
                    : "border-line bg-white text-ink-soft hover:text-ink hover:border-ink/20"
                }`}
                style={active ? { backgroundColor: m.bg, color: m.fg, borderColor: m.bg } : undefined}
                aria-pressed={active}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: m.dot }} />
                {m.label}
              </button>
            );
          })}
        </div>

        <div className="w-px h-5 bg-line mx-1" />

        <Popover
          width={200}
          trigger={() => (
            <button
              className={`h-7 px-2.5 inline-flex items-center gap-1.5 rounded-ctrl text-[12.5px] border focus-ring ${
                filters.dateRange !== "all"
                  ? "bg-accent-soft text-accent-hover border-accent/30"
                  : "bg-white text-ink-soft border-line hover:text-ink hover:border-ink/20"
              }`}
            >
              <Icon name="calendar" size={13} />
              {dateLabel}
              <Icon name="chevron-down" size={12} />
            </button>
          )}
        >
          {(close) => (
            <div>
              {(
                [
                  ["all", "All dates"],
                  ["today", "Today"],
                  ["7d", "Last 7 days"],
                  ["30d", "Last 30 days"],
                  ["90d", "Last 90 days"],
                ] as const
              ).map(([v, label]) => (
                <button
                  key={v}
                  onClick={() => {
                    setFilters((f) => ({ ...f, dateRange: v }));
                    close();
                  }}
                  className={`w-full text-left px-2 h-8 rounded-ctrl text-[13px] flex items-center justify-between hover:bg-[#F4F3EE] ${
                    filters.dateRange === v ? "text-ink" : "text-ink-soft"
                  }`}
                >
                  {label}
                  {filters.dateRange === v && <Icon name="check" size={14} className="text-accent" />}
                </button>
              ))}
            </div>
          )}
        </Popover>

        <Input
          size="sm"
          leading="search"
          placeholder="Search company…"
          value={filters.company}
          onChange={(e) => setFilters((f) => ({ ...f, company: e.target.value }))}
          className="!w-[180px]"
        />

        <Popover
          width={240}
          trigger={() => (
            <button
              className={`h-7 px-2.5 inline-flex items-center gap-1.5 rounded-ctrl text-[12.5px] border focus-ring ${
                filters.scoreMin > 0 || filters.scoreMax < 100
                  ? "bg-accent-soft text-accent-hover border-accent/30"
                  : "bg-white text-ink-soft border-line hover:text-ink hover:border-ink/20"
              }`}
            >
              <Icon name="gauge" size={13} />
              Match {filters.scoreMin}–{filters.scoreMax}
              <Icon name="chevron-down" size={12} />
            </button>
          )}
        >
          <div className="p-1.5">
            <div className="flex items-center justify-between text-[12px] text-ink-soft mb-2">
              <span>Min</span>
              <span className="tabular text-ink">{filters.scoreMin}</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={filters.scoreMin}
              onChange={(e) =>
                setFilters((f) => ({ ...f, scoreMin: Math.min(+e.target.value, f.scoreMax) }))
              }
              className="w-full accent-[#0D9488]"
            />
            <div className="flex items-center justify-between text-[12px] text-ink-soft mt-3 mb-2">
              <span>Max</span>
              <span className="tabular text-ink">{filters.scoreMax}</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={filters.scoreMax}
              onChange={(e) =>
                setFilters((f) => ({ ...f, scoreMax: Math.max(+e.target.value, f.scoreMin) }))
              }
              className="w-full accent-[#0D9488]"
            />
          </div>
        </Popover>

        <div className="grow" />

        {hasFilter && (
          <button
            onClick={clear}
            className="h-7 px-2 text-[12.5px] text-ink-soft hover:text-ink focus-ring rounded-ctrl flex items-center gap-1"
          >
            <Icon name="x" size={12} /> Clear
          </button>
        )}
        <span className="text-[12px] text-ink-soft tabular">
          <span className="text-ink">{totalShown}</span> of {totalAll}
        </span>
      </div>
    </div>
  );
}

/* ---------------- Document link cell ---------------- */

function DocLink({
  icon,
  label,
  onClick,
}: {
  icon: "external-link" | "file-text" | "file";
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1 text-[12.5px] text-ink-soft hover:text-accent-hover focus-ring rounded-ctrl px-1 -mx-1 group"
    >
      <Icon name={icon} size={13} className="text-ink-faint group-hover:text-accent" />
      <span className="group-hover:underline underline-offset-2">{label}</span>
    </button>
  );
}

/* ---------------- Tracker table ---------------- */

function TrackerTable({
  rows,
  selected,
  setSelected,
  onOpenDoc,
  onOpenRow,
}: {
  rows: TrackerRow[];
  selected: Set<string>;
  setSelected: React.Dispatch<React.SetStateAction<Set<string>>>;
  onOpenDoc: (p: DocPayload) => void;
  onOpenRow: (row: TrackerRow) => void;
}) {
  const allOnPageIds = rows.map((r) => r.id);
  const allChecked = rows.length > 0 && allOnPageIds.every((id) => selected.has(id));
  const someChecked = allOnPageIds.some((id) => selected.has(id)) && !allChecked;
  const headerCkRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (headerCkRef.current) headerCkRef.current.indeterminate = someChecked;
  }, [someChecked]);

  const toggleAll = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (allChecked) allOnPageIds.forEach((id) => next.delete(id));
      else allOnPageIds.forEach((id) => next.add(id));
      return next;
    });

  const toggleOne = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="mt-4 bg-white border border-line rounded-card shadow-subtle overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-[13px] text-left" style={{ minWidth: 1180 }}>
          <colgroup>
            <col style={{ width: 40 }} />
            <col style={{ width: 44 }} />
            <col style={{ width: 220 }} />
            <col style={{ width: 240 }} />
            <col style={{ width: 102 }} />
            <col style={{ width: 60 }} />
            <col style={{ width: 56 }} />
            <col style={{ width: 64 }} />
            <col style={{ width: 252 }} />
            <col style={{ width: 134 }} />
            <col style={{ width: 100 }} />
          </colgroup>
          <thead>
            <tr className="bg-[#F7F6F1] text-[12px] text-ink-soft border-b border-line">
              <th className="px-3 py-2.5">
                <input
                  ref={headerCkRef}
                  type="checkbox"
                  className="ck"
                  checked={allChecked}
                  onChange={toggleAll}
                  aria-label="Select all"
                />
              </th>
              <th className="px-2 py-2.5 font-medium tabular text-ink-faint">#</th>
              <th className="px-2 py-2.5 font-medium">Company</th>
              <th className="px-2 py-2.5 font-medium">Role</th>
              <th className="px-2 py-2.5 font-medium">Date Applied</th>
              <th className="px-2 py-2.5 font-medium">JD</th>
              <th className="px-2 py-2.5 font-medium">CL</th>
              <th className="px-2 py-2.5 font-medium">Resume</th>
              <th className="px-2 py-2.5 font-medium">Tailoring Changes</th>
              <th className="px-2 py-2.5 font-medium">Status</th>
              <th className="px-2 py-2.5 font-medium">Confirmation</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={11}>
                  <EmptyResults />
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const isSel = selected.has(r.id);
              return (
                <tr
                  key={r.id}
                  className={`row-zebra border-b border-line/70 last:border-b-0 transition-colors ${
                    isSel ? "!bg-accent-soft/70" : ""
                  }`}
                >
                  <td className="px-3 py-2.5">
                    <input
                      type="checkbox"
                      className="ck"
                      checked={isSel}
                      onChange={() => toggleOne(r.id)}
                      aria-label={`Select row ${r.n}`}
                    />
                  </td>
                  <td className="px-2 py-2.5 tabular text-ink-faint text-[12px]">
                    {String(r.n).padStart(2, "0")}
                  </td>
                  <td className="px-2 py-2.5">
                    <button
                      onClick={() => onOpenRow(r)}
                      className="flex items-center gap-2 min-w-0 focus-ring rounded-ctrl -mx-1 px-1 py-0.5 hover:bg-[#F1F0EB]/70 text-left"
                    >
                      <Monogram name={r.company.name} size={22} />
                      <div className="min-w-0">
                        <div className="text-ink font-medium truncate">{r.company.name}</div>
                        <div className="text-[11.5px] text-ink-soft truncate">{r.location}</div>
                      </div>
                    </button>
                  </td>
                  <td className="px-2 py-2.5">
                    <div className="text-ink truncate">{r.role}</div>
                    <div className="text-[11.5px] text-ink-soft tabular">{r.salary}</div>
                  </td>
                  <td className="px-2 py-2.5 text-ink-soft">{r.appliedAtLabel}</td>
                  <td className="px-2 py-2.5">
                    <DocLink icon="external-link" label="Link" onClick={() => onOpenDoc({ kind: "jd", row: r })} />
                  </td>
                  <td className="px-2 py-2.5">
                    <DocLink icon="file-text" label="View" onClick={() => onOpenDoc({ kind: "cl", row: r })} />
                  </td>
                  <td className="px-2 py-2.5">
                    <DocLink icon="file" label="View" onClick={() => onOpenDoc({ kind: "resume", row: r })} />
                  </td>
                  <td className="px-2 py-2.5">
                    <div className="flex items-start gap-2 min-w-0">
                      <span className="text-ink-soft truncate" title={r.changes}>
                        {r.changes}
                      </span>
                      <button
                        onClick={() => onOpenDoc({ kind: "diff", row: r })}
                        className="shrink-0 text-[12px] text-accent hover:text-accent-hover hover:underline underline-offset-2 focus-ring rounded-ctrl"
                      >
                        see diff
                      </button>
                    </div>
                  </td>
                  <td className="px-2 py-2.5">
                    <StatusPill status={r.status} />
                  </td>
                  <td className="px-2 py-2.5 text-[12.5px]">
                    {r.confirmation ? (
                      <span className="inline-flex items-center gap-1 text-ok">
                        <Icon name="check" size={13} />
                        <span className="tabular">{r.confirmation}</span>
                      </span>
                    ) : (
                      <span className="text-ink-faint">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {rows.length > 0 && (
        <div className="h-10 px-4 flex items-center justify-between text-[12px] text-ink-soft border-t border-line bg-[#FCFBF7]">
          <span>
            Showing <span className="text-ink tabular">{rows.length}</span> of{" "}
            <span className="tabular">{rows.length}</span>
          </span>
          <div className="flex items-center gap-1">
            <button
              className="h-7 w-7 rounded-ctrl hover:bg-[#F1F0EB] flex items-center justify-center focus-ring"
              disabled
              aria-label="Previous"
            >
              <Icon name="chevron-left" size={14} className="text-ink-faint" />
            </button>
            <span className="px-2 tabular text-ink">1</span>
            <button
              className="h-7 w-7 rounded-ctrl hover:bg-[#F1F0EB] flex items-center justify-center focus-ring"
              disabled
              aria-label="Next"
            >
              <Icon name="chevron-right" size={14} className="text-ink-faint" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- Bulk action bar ---------------- */

function BulkBar({
  count,
  onClear,
  onExport,
  onArchive,
}: {
  count: number;
  onClear: () => void;
  onExport: () => void;
  onArchive: () => void;
}) {
  if (!count) return null;
  return (
    <div className="fixed bottom-6 left-1/2 z-30 bulkbar-enter bulkbar-active">
      <div className="bg-ink text-white rounded-card shadow-pop h-11 pl-3 pr-2 flex items-center gap-3 text-[13px]">
        <span className="tabular">
          <span className="font-semibold">{count}</span> selected
        </span>
        <span className="w-px h-5 bg-white/15" />
        <button
          onClick={onExport}
          className="h-8 px-2.5 rounded-ctrl hover:bg-white/10 flex items-center gap-1.5 focus-ring"
        >
          <Icon name="download" size={14} /> Export
        </button>
        <button className="h-8 px-2.5 rounded-ctrl hover:bg-white/10 flex items-center gap-1.5 focus-ring">
          <Icon name="tag" size={14} /> Tag
        </button>
        <button
          onClick={onArchive}
          className="h-8 px-2.5 rounded-ctrl hover:bg-white/10 flex items-center gap-1.5 focus-ring"
        >
          <Icon name="archive" size={14} /> Archive
        </button>
        <span className="w-px h-5 bg-white/15" />
        <button
          onClick={onClear}
          className="h-8 w-8 rounded-ctrl hover:bg-white/10 flex items-center justify-center focus-ring"
          aria-label="Clear selection"
        >
          <Icon name="x" size={15} />
        </button>
      </div>
    </div>
  );
}

/* ---------------- Empty states ---------------- */

function EmptyResults() {
  return (
    <div className="py-16 px-6 flex flex-col items-center text-center">
      <div className="h-12 w-12 rounded-full bg-[#F1F0EB] flex items-center justify-center mb-3">
        <Icon name="filter-x" size={20} className="text-ink-soft" />
      </div>
      <div className="text-[14.5px] font-medium text-ink">No applications match these filters</div>
      <div className="text-[13px] text-ink-soft mt-1 max-w-sm">
        Try widening the date range, lowering the match score, or clearing the company search.
      </div>
    </div>
  );
}

function EmptyTracker() {
  return (
    <div className="mt-4 bg-white border border-sand-200 rounded-xl3 ob-card-shadow">
      <div className="py-20 px-6 flex flex-col items-center text-center">
        <div className="h-14 w-14 rounded-xl2 border border-sand-200 bg-sand-50 flex items-center justify-center mb-4">
          <Icon name="inbox" size={22} className="text-ink-mute" />
        </div>
        <h2 className="font-display font-bold text-[19px] text-ink">No applications yet</h2>
        <p className="text-[14px] text-ink-mute mt-2 max-w-md leading-relaxed">
          Once you start a search, applications appear here as the agent finds, tailors, and submits
          them. You&apos;ll see every change and every confirmation.
        </p>
        <Link
          href="/search"
          className="mt-6 inline-flex items-center gap-2 rounded-full bg-teal-500 hover:bg-teal-600 text-white font-semibold text-[15px] px-5 py-2.5 transition-colors ob-card-shadow"
        >
          <Icon name="search" size={14} />
          Start a new search
        </Link>
      </div>
    </div>
  );
}

/* ---------------- Drawer + sub-views ---------------- */

function DocDrawer({
  open,
  onClose,
  payload,
  masterResumeFile,
}: {
  open: boolean;
  onClose: () => void;
  payload: DocPayload;
  masterResumeFile: string;
}) {
  if (!payload) return null;
  const { kind, row } = payload;
  const titles = {
    jd: `Job description — ${row.company.name}`,
    cl: `Cover letter — ${row.company.name}`,
    resume: masterResumeFile || "Master resume",
    diff: `Tailoring summary — ${row.company.name}`,
  };
  const subtitles = {
    jd: row.role,
    cl: row.coverLetterText ? `For ${row.role}` : "Not generated yet",
    resume: row.changesCount > 0 ? `${row.changesCount} tailoring changes` : "Master resume on file",
    diff: row.changes !== "—" ? row.changes : "No tailoring performed yet",
  };

  const openExternal =
    kind === "jd" ? row.applyUrl : kind === "resume" ? "/api/profile/resume-pdf" : null;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={titles[kind]}
      subtitle={subtitles[kind]}
      headerActions={
        openExternal ? (
          <a
            href={openExternal}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-ctrl text-[12.5px] text-ink-soft hover:text-ink hover:bg-[#F1F0EB]/70 focus-ring"
          >
            <Icon name="external-link" size={13} /> Open
          </a>
        ) : null
      }
      width={580}
    >
      <div className="p-6">
        {kind === "jd" && <JDPreview row={row} />}
        {kind === "cl" && <CoverLetterPreview row={row} />}
        {kind === "resume" && <ResumePreview row={row} masterResumeFile={masterResumeFile} />}
        {kind === "diff" && <DiffPreview row={row} />}
      </div>
    </Drawer>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-[0.06em] font-semibold text-ink-faint mb-2">{title}</div>
      {children}
    </div>
  );
}

function JDPreview({ row }: { row: TrackerRow }) {
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Monogram name={row.company.name} size={32} />
        <div>
          <div className="text-[14px] font-semibold text-ink">{row.role}</div>
          <div className="text-[12.5px] text-ink-soft">
            {row.company.name} · {row.location} · {row.salary}
          </div>
        </div>
      </div>
      {row.applyUrl && (
        <div className="flex items-center gap-2 text-[12.5px] text-ink-soft">
          <Icon name="link" size={13} />
          <a
            href={row.applyUrl}
            className="text-accent hover:text-accent-hover hover:underline underline-offset-2 truncate"
            target="_blank"
            rel="noreferrer"
          >
            {row.applyUrl}
          </a>
        </div>
      )}
      <Section title="Description">
        {row.jdTextClean ? (
          <div className="text-[13.5px] leading-[1.65] text-ink/85 whitespace-pre-wrap max-h-[60vh] overflow-y-auto">
            {row.jdTextClean}
          </div>
        ) : (
          <p className="text-[13px] text-ink-soft italic">
            Job description not stored. Open the original posting above.
          </p>
        )}
      </Section>
    </div>
  );
}

function CoverLetterPreview({ row }: { row: TrackerRow }) {
  if (!row.coverLetterText) {
    return (
      <div className="text-[13px] text-ink-soft italic">
        This application hasn&apos;t been tailored yet, so no cover letter exists. Once the agent
        runs tailoring on it, the letter will appear here.
      </div>
    );
  }
  const words = row.coverLetterText.trim().split(/\s+/).filter(Boolean).length;
  return (
    <div className="space-y-4">
      <pre className="text-[13.5px] leading-[1.7] text-ink/90 whitespace-pre-wrap font-sans">
        {row.coverLetterText}
      </pre>
      <div className="pt-3 mt-3 border-t border-line text-[12px] text-ink-soft flex items-center justify-between">
        <span className="tabular">{words} words</span>
        <span className="flex items-center gap-1.5">
          <Icon name="sparkle" size={12} /> Generated by Claude in your voice
        </span>
      </div>
    </div>
  );
}

function ResumePreview({
  row,
  masterResumeFile,
}: {
  row: TrackerRow;
  masterResumeFile: string;
}) {
  return (
    <div className="space-y-5">
      <div className="bg-[#FCFBF7] border border-line rounded-card p-5 flex items-center gap-4">
        <div className="h-12 w-12 rounded-card bg-white border border-line flex items-center justify-center shrink-0">
          <Icon name="file" size={20} className="text-ink-soft" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-semibold text-ink truncate">
            {masterResumeFile || "Master resume"}
          </div>
          <div className="text-[12.5px] text-ink-soft mt-0.5">
            {row.changesCount > 0
              ? `${row.changesCount} tailoring changes for ${row.role}`
              : `Submitted as-is for ${row.role}`}
          </div>
        </div>
        <a
          href="/api/profile/resume-pdf"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-ctrl bg-white border border-line text-[12.5px] text-ink hover:border-ink/30 focus-ring shrink-0"
        >
          <Icon name="download" size={13} /> Download
        </a>
      </div>
      {row.changes !== "—" && (
        <Section title="Tailoring rationale">
          <p className="text-[13px] leading-[1.65] text-ink/85">{row.changes}</p>
        </Section>
      )}
    </div>
  );
}

function DiffPreview({ row }: { row: TrackerRow }) {
  const hasTailoring = row.changes !== "—" || row.coverLetterText;
  if (!hasTailoring) {
    return (
      <div className="text-[13px] text-ink-soft italic">
        This application hasn&apos;t been tailored yet — no diff to show.
      </div>
    );
  }
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="text-[13px] text-ink-soft">
          Match score{" "}
          <span className="text-ink tabular">{row.matchScore}</span> · Status{" "}
          <span className="text-ink">{row.status}</span>
        </div>
      </div>
      {row.changes !== "—" && (
        <Section title="What Claude changed">
          <p className="text-[13.5px] leading-[1.65] text-ink/90">{row.changes}</p>
        </Section>
      )}
      {row.coverLetterText && (
        <Section title="Cover letter preview">
          <pre className="text-[13px] leading-[1.6] text-ink/85 whitespace-pre-wrap font-sans max-h-[280px] overflow-y-auto bg-[#FCFBF7] border border-line rounded-card p-4">
            {row.coverLetterText.slice(0, 800)}
            {row.coverLetterText.length > 800 ? "…" : ""}
          </pre>
        </Section>
      )}
    </div>
  );
}
