"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Monogram } from "@/components/ui/monogram";
import { Popover } from "@/components/ui/popover";
import { STATUSES, STATUS_META, StatusPill } from "@/components/ui/status-pill";
import { Toast } from "@/components/ui/toast";
import { TRACKER_ROWS } from "@/lib/data";
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

export default function TrackerPage() {
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
  const [empty, setEmpty] = useState(false);

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

  return (
    <div className="min-h-screen text-ink pb-24">
      <div className="max-w-[1280px] mx-auto px-8">
        <PageHeader
          total={TRACKER_ROWS.length}
          lastUpdatedMin={2}
          onExport={onExport}
        />

        {/* Reviewer-only preview toggle for the empty state */}
        <div className="flex items-center gap-2 text-[11.5px] text-ink-faint pb-3 -mt-2">
          <button
            onClick={() => setEmpty((e) => !e)}
            className="px-2 h-6 rounded-full border border-dashed border-line hover:border-ink/30 hover:text-ink-soft focus-ring"
          >
            Preview: {empty ? "show populated" : "show empty state"}
          </button>
        </div>

        {empty ? (
          <EmptyTracker onStartSearch={() => setEmpty(false)} />
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

      <DocDrawer open={!!docPayload} onClose={() => setDocPayload(null)} payload={docPayload} />

      <Toast
        open={toast.open}
        message={toast.message}
        kind={toast.kind}
        onClose={() => setToast((t) => ({ ...t, open: false }))}
      />
    </div>
  );
}

/* ---------------- Page header ---------------- */

function PageHeader({
  total,
  lastUpdatedMin,
  onExport,
}: {
  total: number;
  lastUpdatedMin: number;
  onExport: () => void;
}) {
  return (
    <div className="pt-9 pb-5">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-ink">Application Tracker</h1>
          <p className="text-[13px] text-ink-soft mt-1">
            <span className="tabular text-ink">{total}</span> applications · Last updated{" "}
            <span className="tabular">{lastUpdatedMin}</span> minutes ago
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="md" leading={<Icon name="refresh-cw" size={14} />}>
            Refresh
          </Button>
          <Button variant="secondary" size="md" leading={<Icon name="download" size={14} />} onClick={onExport}>
            Export to Excel
          </Button>
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

function EmptyTracker({ onStartSearch }: { onStartSearch: () => void }) {
  return (
    <div className="mt-4 bg-white border border-line rounded-card shadow-subtle">
      <div className="py-20 px-6 flex flex-col items-center text-center">
        <div className="h-14 w-14 rounded-card border border-line bg-[#FCFBF6] flex items-center justify-center mb-4">
          <Icon name="inbox" size={22} className="text-ink-soft" />
        </div>
        <h2 className="text-[16px] font-semibold text-ink">No applications yet</h2>
        <p className="text-[13.5px] text-ink-soft mt-1.5 max-w-md">
          Once you start a search, applications will appear here as Onbehalf finds, tailors, and submits them.
          You&apos;ll see every change and every confirmation.
        </p>
        <div className="mt-5">
          <Button variant="primary" size="md" leading={<Icon name="search" size={14} />} onClick={onStartSearch}>
            Start a new search
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Drawer + sub-views ---------------- */

function DocDrawer({
  open,
  onClose,
  payload,
}: {
  open: boolean;
  onClose: () => void;
  payload: DocPayload;
}) {
  if (!payload) return null;
  const { kind, row } = payload;
  const titles = {
    jd: `Job description — ${row.company.name}`,
    cl: `Cover letter — ${row.company.name}`,
    resume: row.resumeFile,
    diff: `Tailoring diff — ${row.company.name}`,
  };
  const subtitles = {
    jd: row.role,
    cl: `Generated for ${row.role}`,
    resume: `Tailored for ${row.role} · ${row.changesCount} changes`,
    diff: `${row.changesCount} changes · Match ${row.matchScore}`,
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={titles[kind]}
      subtitle={subtitles[kind]}
      headerActions={
        <>
          <Button variant="ghost" size="sm" leading={<Icon name="external-link" size={13} />}>
            Open
          </Button>
          <Button variant="secondary" size="sm" leading={<Icon name="download" size={13} />}>
            Download
          </Button>
        </>
      }
      width={580}
    >
      <div className="p-6">
        {kind === "jd" && <JDPreview row={row} />}
        {kind === "cl" && <CoverLetterPreview row={row} />}
        {kind === "resume" && <ResumePreview row={row} />}
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
      <div className="flex items-center gap-2 text-[12.5px] text-ink-soft">
        <Icon name="link" size={13} />
        <a
          href={row.jd}
          className="text-accent hover:text-accent-hover hover:underline underline-offset-2 truncate"
          target="_blank"
          rel="noreferrer"
        >
          {row.jd}
        </a>
      </div>
      <Section title="About the role">
        <p className="text-[13.5px] leading-[1.65] text-ink/85">
          We&apos;re hiring a {row.role.toLowerCase()} to work alongside our product and design teams on the core
          surface our customers use every day. You&apos;ll own end-to-end delivery of features, write clear technical
          specs, and partner closely with engineering managers to set quality bars for the team.
        </p>
      </Section>
      <Section title="What you'll do">
        <ul className="space-y-1.5 text-[13.5px] leading-[1.6] text-ink/85 list-disc pl-5">
          <li>Ship features end-to-end across a TypeScript and React stack.</li>
          <li>Drive measurable improvements to performance, reliability, and craft.</li>
          <li>Partner with design on the next generation of the editor surface.</li>
          <li>Mentor mid-level engineers; write thoughtful code reviews.</li>
        </ul>
      </Section>
      <Section title="What we're looking for">
        <ul className="space-y-1.5 text-[13.5px] leading-[1.6] text-ink/85 list-disc pl-5">
          <li>6+ years of professional engineering experience.</li>
          <li>Deep React and TypeScript fluency; product taste.</li>
          <li>Track record of shipping consumer-grade or developer-grade tools.</li>
          <li>Experience with collaborative editing, CRDTs, or document systems is a plus.</li>
        </ul>
      </Section>
    </div>
  );
}

function CoverLetterPreview({ row }: { row: TrackerRow }) {
  return (
    <div className="space-y-4 text-[13.5px] leading-[1.7] text-ink/90">
      <div className="text-ink-soft text-[12.5px]">Dear hiring team at {row.company.name},</div>
      <p>
        I&apos;m applying for the <strong className="font-medium text-ink">{row.role}</strong> role. I&apos;ve spent
        the last several years building product surfaces that real people use every day, and the work your team is
        doing on collaborative editing is the kind of problem I want to keep solving.
      </p>
      <p>
        In my current role I led the rewrite of our editor&apos;s rendering pipeline, taking p95 typing latency from
        120ms to 28ms and shipping it with no regressions over a 90-day rollout. I care about the small details —
        keyboard behavior, accessibility, the way a UI feels under load — and I write code reviews that other
        engineers actually like to read.
      </p>
      <p>
        What draws me to {row.company.name} specifically is the bar you&apos;ve set for craft. I&apos;d love the
        chance to talk about how I&apos;d contribute on the team.
      </p>
      <div className="pt-1">
        <div>Thanks,</div>
        <div className="font-medium text-ink">Maya Chen</div>
      </div>
      <div className="pt-3 mt-3 border-t border-line text-[12px] text-ink-soft flex items-center justify-between">
        <span>247 / 250 words</span>
        <span className="flex items-center gap-1.5">
          <Icon name="sparkle" size={12} /> Tailored from your master letter
        </span>
      </div>
    </div>
  );
}

function ResumePreview({ row }: { row: TrackerRow }) {
  return (
    <div className="space-y-5">
      <div className="bg-[#FCFBF7] border border-line rounded-card p-5">
        <div className="text-[15px] font-semibold text-ink">Maya Chen</div>
        <div className="text-[12.5px] text-ink-soft">
          San Francisco, CA · maya@chen.dev · linkedin.com/in/mchen
        </div>
        <div className="mt-4 space-y-3.5">
          <div>
            <div className="flex items-baseline justify-between">
              <div className="text-[13px] font-semibold text-ink">Senior Product Engineer · Brightlane</div>
              <div className="text-[12px] text-ink-soft tabular">2022 — Present</div>
            </div>
            <ul className="mt-1 list-disc pl-5 space-y-1 text-[12.5px] leading-[1.55] text-ink/85">
              <li>Architected a Kubernetes-orchestrated deploy pipeline; cut deploy time from 22 to 3 minutes.</li>
              <li>Built React + TypeScript component library used across 6 product teams.</li>
              <li>Drove direction with design — no PM on the surface.</li>
            </ul>
          </div>
          <div>
            <div className="flex items-baseline justify-between">
              <div className="text-[13px] font-semibold text-ink">Software Engineer · Loop</div>
              <div className="text-[12px] text-ink-soft tabular">2019 — 2022</div>
            </div>
            <ul className="mt-1 list-disc pl-5 space-y-1 text-[12.5px] leading-[1.55] text-ink/85">
              <li>Shipped the team&apos;s first design-system primitives; adopted across 12 product surfaces.</li>
              <li>Reduced support tickets by 38% with a framework-agnostic deploy log streamer.</li>
            </ul>
          </div>
        </div>
      </div>
      <div className="text-[12.5px] text-ink-soft flex items-center gap-2">
        <Icon name="git-pull-request" size={13} />
        {row.changesCount} changes from master ·{" "}
        <button className="text-accent hover:text-accent-hover hover:underline underline-offset-2">View diff</button>
      </div>
    </div>
  );
}

function DiffPreview({ row }: { row: TrackerRow }) {
  const changes = [
    {
      reason: "JD emphasizes payment systems scale; called out volume.",
      before: "Owned the checkout rewrite; partnered with design.",
      after:
        "Owned the rewrite of a checkout flow processing $2.4B/yr; led 4-engineer team and partnered closely with design.",
    },
    {
      reason: "Surface React performance work — repeated in JD.",
      before: "Improved editor performance.",
      after: "Cut p95 typing latency from 120ms to 28ms in a production React editor used by 400k DAU.",
    },
    {
      reason: "Promote payments-adjacent infra work; align language to JD.",
      before: "Built a logs streamer.",
      after:
        "Built a framework-agnostic deploy log streamer adopted across 12 surfaces; cut support load by 38%.",
    },
  ];
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="text-[13px] text-ink-soft">{row.changesCount} changes, all explained.</div>
        <div className="flex items-center gap-1.5 text-[12px] text-ink-soft">
          <span className="inline-flex items-center gap-1">
            <span className="w-2.5 h-px bg-accent" />
            added
          </span>
          <span className="inline-flex items-center gap-1 ml-2">
            <span className="w-2.5 h-px bg-ink-faint" />
            removed
          </span>
        </div>
      </div>
      {changes.map((c, i) => (
        <div key={i} className="border border-line rounded-card overflow-hidden">
          <div className="px-3 py-2 bg-[#FCFBF7] border-b border-line text-[12px] text-ink-soft flex items-center gap-1.5">
            <Icon name="info" size={12} />
            {c.reason}
          </div>
          <div className="p-3 space-y-2 text-[13px] leading-[1.55]">
            <div className="text-ink-faint">
              <span className="line-through decoration-ink-faint/60">{c.before}</span>
            </div>
            <div className="text-ink">
              <span className="border-b border-accent">{c.after}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
