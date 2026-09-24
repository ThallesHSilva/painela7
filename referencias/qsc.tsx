import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useState, type ComponentType } from "react";
import {
  CalendarDays,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  UsersRound,
  Wifi,
  type LucideProps,
} from "lucide-react";
import { DashboardLayout } from "@/layouts/DashboardLayout";
import { ErrorState } from "@/components/EmptyState";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useQsc } from "@/hooks/useData";
import { fmtInt, fmtPct } from "@/lib/format";
import type { QscDomain, QscMetricSeries } from "@/lib/qsc";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/qsc")({
  head: () => ({ meta: [{ title: "QSC — Mapa Parque" }] }),
  component: QscPage,
});

const DOMAIN_META: Record<
  QscDomain,
  {
    label: string;
    shortLabel: string;
    eyebrow: string;
    icon: ComponentType<LucideProps>;
    accent: string;
    surface: string;
  }
> = {
  carteira: {
    label: "QSC Carteira",
    shortLabel: "Carteira",
    eyebrow: "Manutenção e fidelização",
    icon: UsersRound,
    accent: "text-violet-600 dark:text-violet-300",
    surface: "border-violet-400/20 from-violet-500/[0.11] to-primary/[0.04]",
  },
  fixa: {
    label: "QSC Banda Larga",
    shortLabel: "Banda Larga",
    eyebrow: "Qualidade das vendas fixas",
    icon: Wifi,
    accent: "text-cyan-700 dark:text-cyan-300",
    surface: "border-cyan-400/20 from-cyan-500/[0.11] to-primary/[0.04]",
  },
  movel: {
    label: "QSC Móvel",
    shortLabel: "Móvel",
    eyebrow: "Performance e experiência",
    icon: Smartphone,
    accent: "text-fuchsia-700 dark:text-fuchsia-300",
    surface: "border-fuchsia-400/20 from-fuchsia-500/[0.11] to-primary/[0.04]",
  },
};

const INDICATOR_BAND_STYLE: Record<string, string> = {
  "1": "border-emerald-500/20 bg-emerald-500 text-white",
  "2": "border-amber-500/25 bg-amber-100 text-amber-900 dark:bg-amber-400/20 dark:text-amber-200",
  "3": "border-orange-500/25 bg-orange-100 text-orange-900 dark:bg-orange-400/20 dark:text-orange-200",
  "4": "border-red-500/25 bg-red-500 text-white",
};

const PULSE_METRICS = [
  { id: "early-churn-fixa", label: "Early Churn Fixa" },
  { id: "early-churn-movel", label: "Early Churn Móvel" },
  { id: "churn-bl", label: "Churn Fixa" },
  { id: "churn-movel", label: "Churn Móvel" },
  { id: "saldo-portabilidade", label: "Saldo de Portabilidade" },
] as const;

function qscTotalRatingFromTotal(total: number | null) {
  if (total === null) return null;

  if (total >= 90) {
    return {
      total,
      band: "Faixa 5",
      points: 1000,
      className: "border-emerald-500/20 bg-emerald-500 text-white",
    };
  }
  if (total >= 80) {
    return {
      total,
      band: "Faixa 4",
      points: 800,
      className:
        "border-lime-500/25 bg-lime-100 text-lime-900 dark:bg-lime-400/20 dark:text-lime-200",
    };
  }
  if (total >= 70) {
    return {
      total,
      band: "Faixa 3",
      points: 600,
      className:
        "border-amber-500/25 bg-amber-100 text-amber-900 dark:bg-amber-400/20 dark:text-amber-200",
    };
  }
  if (total >= 60) {
    return {
      total,
      band: "Faixa 2",
      points: 400,
      className:
        "border-orange-500/25 bg-orange-100 text-orange-900 dark:bg-orange-400/20 dark:text-orange-200",
    };
  }
  if (total >= 50) {
    return {
      total,
      band: "Faixa 1",
      points: 200,
      className: "border-red-500/25 bg-red-500 text-white",
    };
  }
  return {
    total,
    band: "Sem faixa",
    points: 0,
    className: "border-red-500/20 bg-red-100 text-red-900 dark:bg-red-400/20 dark:text-red-200",
  };
}

function qscTotalRating(metrics: QscMetricSeries[]) {
  const scores = metrics.flatMap((metric) =>
    metric.latest?.score == null ? [] : metric.latest.score,
  );
  return qscTotalRatingFromTotal(
    scores.length ? scores.reduce((sum, score) => sum + score, 0) : null,
  );
}

function formatCompetence(competence?: string) {
  if (!competence) return "Sem competência";
  const [year, month] = competence.split("-").map(Number);
  if (!year || !month) return competence;
  return new Intl.DateTimeFormat("pt-BR", { month: "short", year: "numeric" })
    .format(new Date(year, month - 1, 1))
    .replace(" de ", "/")
    .replace(".", "");
}

function formatUpdatedAt(value?: string) {
  if (!value) return "Aguardando atualização";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Data indisponível";

  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(date)
    .replace(" de ", " ")
    .replace(",", " •");
}

function SummaryPanel({ domain, metrics }: { domain: QscDomain; metrics: QscMetricSeries[] }) {
  const meta = DOMAIN_META[domain];
  const Icon = meta.icon;
  const totalRating = qscTotalRating(metrics);
  const [expandedMetricId, setExpandedMetricId] = useState<string | null>(null);
  return (
    <Card
      className={cn(
        "overflow-hidden rounded-[1.8rem] border bg-gradient-to-br shadow-elegant",
        meta.surface,
      )}
    >
      <div className="flex items-center justify-between gap-4 border-b border-border/55 bg-background/45 px-5 py-4 sm:px-6">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "grid size-10 place-items-center rounded-2xl bg-background/70 shadow-sm ring-1 ring-border/50",
              meta.accent,
            )}
          >
            <Icon className="size-5" />
          </div>
          <div>
            <p className={cn("text-[10px] font-semibold uppercase tracking-[0.16em]", meta.accent)}>
              {meta.eyebrow}
            </p>
            <h2 className="mt-0.5 text-lg font-semibold tracking-tight">
              Resumo {meta.shortLabel}
            </h2>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="rounded-full border border-border/60 bg-background/70 px-3 py-1.5 text-[11px] font-semibold text-muted-foreground">
            Mês corrente
          </span>
          {totalRating ? (
            <div
              className={cn(
                "flex items-center gap-2 rounded-xl border px-3 py-1.5 shadow-sm",
                totalRating.className,
              )}
            >
              <span className="text-[10px] font-semibold uppercase tracking-[0.12em] opacity-80">
                Nota QSC
              </span>
              <strong className="text-sm tabular-nums">{totalRating.total}</strong>
              <span className="border-l border-current/20 pl-2 text-[10px] font-bold uppercase tracking-wide">
                {totalRating.band}
              </span>
              <span className="text-[10px] font-semibold tabular-nums">
                {fmtInt(totalRating.points)} pts
              </span>
            </div>
          ) : null}
        </div>
      </div>
      <div className="overflow-x-auto px-3 py-3 sm:px-4 sm:py-4">
        <Table className="min-w-[720px]">
          <TableHeader className="bg-background/55 [&_th]:h-auto [&_th]:border-b [&_th]:border-border/55 [&_th]:px-4 [&_th]:py-3 [&_th]:text-[10px] [&_th]:font-semibold [&_th]:uppercase [&_th]:tracking-[0.12em] [&_th]:text-muted-foreground">
            <TableRow className="hover:bg-transparent">
              <TableHead className="min-w-[260px]">Indicador</TableHead>
              <TableHead className="text-right">KPI1</TableHead>
              <TableHead className="text-right">KPI2</TableHead>
              <TableHead className="text-right">%</TableHead>
              <TableHead className="text-right">Nota</TableHead>
              <TableHead className="text-right">Faixa</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="[&_td]:whitespace-nowrap [&_td]:px-4 [&_td]:py-3 [&_tr]:border-border/45 [&_tr]:transition-colors [&_tr:hover]:bg-background/55">
            {metrics.map((metric) => {
              const isExpanded = expandedMetricId === metric.id;
              const history = metric.history.slice(-6);

              return (
                <Fragment key={metric.id}>
                  <TableRow className={cn(isExpanded && "bg-background/55")}>
                    <TableCell className="font-medium text-foreground">
                      <button
                        type="button"
                        onClick={() => setExpandedMetricId(isExpanded ? null : metric.id)}
                        className="group flex items-center gap-2 text-left outline-none"
                        aria-expanded={isExpanded}
                      >
                        <span
                          className={cn(
                            "grid size-6 place-items-center rounded-lg border border-border/60 bg-background/70 transition-colors group-hover:border-primary/35",
                            isExpanded && "border-primary/35 bg-primary/10 text-primary",
                          )}
                        >
                          {isExpanded ? (
                            <ChevronUp className="size-3.5" />
                          ) : (
                            <ChevronDown className="size-3.5" />
                          )}
                        </span>
                        <span>{metric.label}</span>
                      </button>
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {fmtInt(metric.latest?.numerator)}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {fmtInt(metric.latest?.denominator)}
                    </TableCell>
                    <TableCell className={cn("text-right font-semibold tabular-nums", meta.accent)}>
                      {fmtPct(metric.latest?.value)}
                    </TableCell>
                    <TableCell className="text-right font-bold tabular-nums">
                      {metric.latest?.score ?? "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {metric.latest?.scoreBand ? (
                        <span
                          className={cn(
                            "inline-flex min-w-8 justify-center rounded-full border px-2 py-1 text-[10px] font-bold",
                            INDICATOR_BAND_STYLE[metric.latest.scoreBand],
                          )}
                        >
                          {metric.latest.scoreBand}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                  {isExpanded ? (
                    <TableRow className="bg-background/40 hover:bg-background/40">
                      <TableCell colSpan={6} className="whitespace-normal !p-0">
                        <div className="border-y border-primary/10 bg-background/50 px-4 py-4 sm:px-5">
                          <div className="mb-3 flex items-center justify-between gap-3">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                              Histórico do indicador
                            </p>
                            <span className="text-[10px] font-medium text-muted-foreground">
                              Últimos {history.length} meses
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                            {history.map((point) => (
                              <div
                                key={point.competence}
                                className="rounded-xl border border-border/60 bg-card/80 px-3 py-2.5 shadow-sm"
                              >
                                <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                                  {formatCompetence(point.competence)}
                                </div>
                                <div
                                  className={cn("mt-1 text-sm font-bold tabular-nums", meta.accent)}
                                >
                                  {fmtPct(point.value)}
                                </div>
                                <div className="mt-2 flex items-center justify-between gap-2 text-[10px] font-semibold text-muted-foreground">
                                  <span>Nota {point.score ?? "—"}</span>
                                  {point.scoreBand ? (
                                    <span
                                      className={cn(
                                        "rounded-full border px-1.5 py-0.5 font-bold",
                                        INDICATOR_BAND_STYLE[point.scoreBand],
                                      )}
                                    >
                                      F{point.scoreBand}
                                    </span>
                                  ) : null}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : null}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}

function PulseMetricCard({ metric, label }: { metric: QscMetricSeries; label: string }) {
  return (
    <Card className="relative overflow-hidden rounded-2xl border-border/70 bg-card/90 p-4 shadow-elegant transition-transform duration-200 hover:-translate-y-0.5">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
      <p className="min-h-8 text-[10px] font-semibold uppercase leading-relaxed tracking-[0.13em] text-muted-foreground">
        {label}
      </p>
      <div className="mt-2 flex items-end justify-between gap-3">
        <p className="text-2xl font-semibold tracking-tight tabular-nums">
          {fmtPct(metric.latest?.value)}
        </p>
        {metric.latest?.scoreBand ? (
          <span
            className={cn(
              "rounded-full border px-2 py-1 text-[10px] font-bold",
              INDICATOR_BAND_STYLE[metric.latest.scoreBand],
            )}
          >
            F{metric.latest.scoreBand}
          </span>
        ) : null}
      </div>
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-border/55 pt-2.5 text-[10px] font-medium text-muted-foreground">
        <span>Nota {metric.latest?.score ?? "—"}</span>
        <span className="tabular-nums">
          {fmtInt(metric.latest?.numerator)} / {fmtInt(metric.latest?.denominator)}
        </span>
      </div>
    </Card>
  );
}

const SEMESTER_DOMAINS: Array<{ domain: QscDomain; label: string }> = [
  { domain: "carteira", label: "QSC Carteira" },
  { domain: "fixa", label: "QSC Fixa" },
  { domain: "movel", label: "QSC Móvel" },
];

function semesterCompetencies(currentCompetence: string, semester: 1 | 2) {
  const year = Number(currentCompetence.slice(0, 4)) || new Date().getFullYear();
  const firstMonth = semester === 1 ? 1 : 7;
  return Array.from(
    { length: 6 },
    (_, index) => `${year}-${String(firstMonth + index).padStart(2, "0")}`,
  );
}

function qscHistoryRow(domain: QscDomain, metrics: QscMetricSeries[], competencies: string[]) {
  const domainMetrics = metrics.filter((metric) => metric.domain === domain);
  const values = competencies.map((competence) => {
    const scores = domainMetrics.flatMap((metric) => {
      const score = metric.history.find((point) => point.competence === competence)?.score;
      return score == null ? [] : score;
    });
    return scores.length ? scores.reduce((sum, score) => sum + score, 0) : null;
  });
  const availableValues = values.filter((value): value is number => value !== null);
  const totalizer = availableValues.length
    ? Math.round(availableValues.reduce((sum, value) => sum + value, 0) / availableValues.length)
    : null;

  return {
    values,
    totalizer,
    rating: qscTotalRatingFromTotal(totalizer),
  };
}

function SemesterHistoryPanel({
  metrics,
  currentCompetence,
}: {
  metrics: QscMetricSeries[];
  currentCompetence: string;
}) {
  const currentMonth = Number(currentCompetence.slice(5, 7)) || new Date().getMonth() + 1;
  const [selectedSemester, setSelectedSemester] = useState<1 | 2>(currentMonth <= 6 ? 1 : 2);
  const competencies = semesterCompetencies(currentCompetence, selectedSemester);
  const historyRows = SEMESTER_DOMAINS.map(({ domain, label }) => ({
    domain,
    label,
    ...qscHistoryRow(domain, metrics, competencies),
  }));
  const semesterLabel = `${selectedSemester}º semestre de ${competencies[0]?.slice(0, 4)}`;

  return (
    <Card className="overflow-hidden rounded-[1.8rem] border-primary/15 bg-gradient-to-br from-card via-card to-primary/[0.035] shadow-elegant">
      <div className="flex flex-col gap-3 border-b border-primary/10 bg-primary/[0.035] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">
            Histórico consolidado
          </p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight">
            Visão histórica por semestre
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div
            className="inline-flex rounded-xl border border-primary/15 bg-background/75 p-1 shadow-sm"
            aria-label="Selecionar semestre do histórico QSC"
          >
            {([1, 2] as const).map((semester) => (
              <button
                key={semester}
                type="button"
                onClick={() => setSelectedSemester(semester)}
                aria-pressed={selectedSemester === semester}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-all",
                  selectedSemester === semester
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-primary/[0.07] hover:text-foreground",
                )}
              >
                {semester}º semestre
              </button>
            ))}
          </div>
          <span className="w-fit rounded-full border border-primary/15 bg-background/75 px-3 py-1.5 text-[11px] font-semibold text-muted-foreground">
            {semesterLabel}
          </span>
        </div>
      </div>
      <div className="overflow-x-auto p-3 sm:p-5">
        <Table className="min-w-[1220px] table-fixed">
          <colgroup>
            <col className="w-[280px]" />
            {competencies.map((competence) => (
              <col key={competence} className="w-[95px]" />
            ))}
            <col className="w-[120px]" />
            <col className="w-[100px]" />
            <col className="w-[120px]" />
            <col className="w-[115px]" />
          </colgroup>
          <TableHeader className="bg-primary/[0.045] [&_th]:h-auto [&_th]:whitespace-nowrap [&_th]:border-b [&_th]:border-primary/15 [&_th]:px-3 [&_th]:py-3.5 [&_th]:text-[10px] [&_th]:font-semibold [&_th]:uppercase [&_th]:tracking-[0.1em] [&_th]:text-muted-foreground">
            <TableRow className="hover:bg-transparent">
              <TableHead>Indicadores</TableHead>
              {competencies.map((competence) => (
                <TableHead key={competence} className="text-right">
                  {formatCompetence(competence).split("/")[0]}
                </TableHead>
              ))}
              <TableHead className="text-right">Totalizador</TableHead>
              <TableHead className="text-right">Pts</TableHead>
              <TableHead className="text-right">Faixa</TableHead>
              <TableHead>Periodicidade</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="[&_td]:px-3 [&_td]:py-3.5 [&_tr]:border-primary/[0.09] [&_tr]:transition-colors [&_tr:hover]:bg-primary/[0.03]">
            {historyRows.map((row) => {
              const meta = DOMAIN_META[row.domain];
              return (
                <TableRow key={row.domain}>
                  <TableCell className={cn("font-semibold", meta.accent)}>{row.label}</TableCell>
                  {row.values.map((value, index) => (
                    <TableCell
                      key={competencies[index]}
                      className="text-right font-semibold tabular-nums"
                    >
                      {fmtInt(value)}
                    </TableCell>
                  ))}
                  <TableCell className="bg-primary/[0.025] text-right font-bold tabular-nums text-foreground">
                    {fmtInt(row.totalizer)}
                  </TableCell>
                  <TableCell className="text-right font-bold tabular-nums">
                    {fmtInt(row.rating?.points)}
                  </TableCell>
                  <TableCell className="text-right">
                    {row.rating ? (
                      <span
                        className={cn(
                          "inline-flex rounded-full border px-2 py-1 text-[10px] font-bold uppercase",
                          row.rating.className,
                        )}
                      >
                        {row.rating.band}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs font-medium text-muted-foreground">
                    Mensal
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}

function QscPage() {
  const { data, isLoading, error, refetch } = useQsc();
  const today = new Date();
  const fallbackCompetence = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  const currentCompetence = data?.competence ?? fallbackCompetence;
  const hasCurrentCompetence = data?.available ?? false;
  const metrics = data?.metrics ?? [];
  const metricsByDomain = (domain: QscDomain) =>
    metrics.filter((metric) => metric.domain === domain);
  const pulseMetrics = PULSE_METRICS.flatMap(({ id, label }) => {
    const metric = metrics.find((item) => item.id === id);
    return metric ? [{ metric, label }] : [];
  });

  return (
    <DashboardLayout title="QSC">
      {error ? (
        <ErrorState onRetry={() => refetch()} />
      ) : (
        <>
          <Card className="relative mb-7 overflow-hidden rounded-[2rem] border-primary/15 bg-gradient-to-br from-primary/[0.17] via-card/95 to-cyan/[0.13] p-6 shadow-elevated backdrop-blur-sm md:p-8">
            <div className="pointer-events-none absolute -left-16 -top-20 size-64 rounded-full bg-primary/25 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-28 right-0 size-72 rounded-full bg-cyan/25 blur-3xl" />
            <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-2xl">
                <div className="flex items-center gap-3">
                  <div className="grid size-12 place-items-center rounded-2xl bg-gradient-brand text-primary-foreground shadow-elegant ring-4 ring-primary/10">
                    <ClipboardCheck className="size-5" />
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
                      Qualidade, sustentabilidade e consistência
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Visão consolidada da carteira, fixa e móvel
                    </p>
                  </div>
                </div>
                <h2 className="mt-5 text-3xl font-semibold leading-[1.08] tracking-tight md:text-4xl">
                  Indicadores QSC em uma leitura executiva.
                </h2>
              </div>

              <div className="grid gap-2 sm:grid-cols-2 lg:min-w-[390px]">
                <div className="rounded-2xl border border-primary/10 bg-background/65 px-4 py-3 shadow-sm backdrop-blur">
                  <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    <CalendarDays className="size-3.5 text-primary" />
                    Competência
                  </div>
                  <div className="mt-1.5 text-sm font-semibold">
                    {formatCompetence(currentCompetence)}
                  </div>
                </div>
                <div className="rounded-2xl border border-primary/10 bg-background/65 px-4 py-3 shadow-sm backdrop-blur">
                  <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    <RefreshCw className="size-3.5 text-primary" />
                    Atualização da base
                  </div>
                  <div className="mt-1.5 text-sm font-semibold tabular-nums">
                    {formatUpdatedAt(data?.calculatedAt)}
                  </div>
                </div>
              </div>
            </div>
          </Card>

          {isLoading ? (
            <div className="grid gap-4 md:grid-cols-3">
              {[0, 1, 2].map((item) => (
                <div key={item} className="h-40 animate-pulse rounded-[1.65rem] bg-muted/60" />
              ))}
            </div>
          ) : !hasCurrentCompetence ? (
            <Card className="rounded-[2rem] border-dashed p-10 text-center">
              <ShieldCheck className="mx-auto size-9 text-muted-foreground" />
              <h2 className="mt-4 text-lg font-semibold">
                Sem dados QSC para {formatCompetence(currentCompetence)}
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                A visão exibe somente o mês corrente. Carregue a competência atual para visualizar
                os indicadores.
              </p>
            </Card>
          ) : (
            <div className="space-y-7">
              <section className="mx-auto max-w-[1360px]">
                <SemesterHistoryPanel metrics={metrics} currentCompetence={currentCompetence} />
              </section>

              <section className="mx-auto max-w-[1360px]">
                <div className="mb-3 flex items-end justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">
                      Indicadores críticos
                    </p>
                    <h2 className="mt-1 text-lg font-semibold tracking-tight">Pulso do mês</h2>
                  </div>
                  <span className="text-xs text-muted-foreground">Competência atual</span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  {pulseMetrics.map(({ metric, label }) => (
                    <PulseMetricCard key={metric.id} metric={metric} label={label} />
                  ))}
                </div>
              </section>

              <section className="mx-auto max-w-[1360px] space-y-4">
                {(["carteira", "fixa", "movel"] as QscDomain[]).map((domain) => (
                  <SummaryPanel key={domain} domain={domain} metrics={metricsByDomain(domain)} />
                ))}
              </section>
            </div>
          )}
        </>
      )}
    </DashboardLayout>
  );
}
