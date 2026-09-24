import { createFileRoute } from "@tanstack/react-router";
import type { QscApiResponse, QscMetricSeries } from "@/lib/qsc";
import { readAuthUser } from "@/lib/auth.server";
import { getDataSnapshot, type SnapshotFor } from "@/lib/snapshots.server";

const ALL_SCOPE_ID = "__all__";
type StoredSnapshot = SnapshotFor<"qsc">;
type StoredScope = StoredSnapshot["scopes"][number];
type StoredMetric = StoredScope["metrics"][number];

async function readQscSnapshot() {
  return getDataSnapshot("qsc");
}

function withMetricScore(
  point: QscMetricSeries["latest"],
  scoreRules: QscMetricSeries["scoreRules"],
) {
  if (!point || point.value === null || !Number.isFinite(point.value)) return point;

  const percentage = point.value * 100;
  const matchingRule = scoreRules.find(
    (rule, index) =>
      percentage >= rule.start && (index === scoreRules.length - 1 || percentage < rule.end),
  );

  return {
    ...point,
    score: matchingRule?.score ?? null,
    scoreBand: matchingRule?.band ?? null,
  };
}

function currentCompetence(snapshot: StoredSnapshot) {
  return [...snapshot.competencies].sort().at(-1) ?? "";
}

function metricForResponse(metric: StoredMetric, history: StoredMetric[] = []) {
  return {
    id: metric.id,
    domain: metric.domain,
    label: metric.label,
    formula: metric.formula,
    interpretation: metric.interpretation,
    favorableDirection: metric.favorableDirection,
    scoreRules: metric.scoreRules,
    latest: withMetricScore(metric.latest, metric.scoreRules),
    history: history.map((point) => withMetricScore(point.latest, metric.scoreRules)),
  } as QscMetricSeries;
}

function metricsForScope(scope: StoredScope | undefined, competence: string) {
  const metricGroups = new Map<string, StoredMetric[]>();

  for (const metric of scope?.metrics ?? []) {
    if (metric.latest.competence > competence) continue;
    const history = metricGroups.get(metric.id) ?? [];
    history.push(metric);
    metricGroups.set(metric.id, history);
  }

  return [...metricGroups.values()].flatMap((history) => {
    const sortedHistory = [...history].sort((left, right) =>
      left.latest.competence.localeCompare(right.latest.competence),
    );
    const currentMetric = sortedHistory.find((metric) => metric.latest.competence === competence);
    return currentMetric ? [metricForResponse(currentMetric, sortedHistory)] : [];
  });
}

function aggregateScopes(snapshot: StoredSnapshot, scopeIds: string[], competence: string) {
  const scopes = snapshot.scopes.filter(
    (scope) => scope.id !== ALL_SCOPE_ID && scopeIds.includes(scope.id),
  );
  const rows = scopes.reduce(
    (total, scope) =>
      total + (scope.rowsByCompetence[competence as keyof typeof scope.rowsByCompetence] ?? 0),
    0,
  );
  const metricMap = new Map<string, QscMetricSeries>();

  for (const scope of scopes) {
    for (const storedMetric of scope.metrics) {
      if (storedMetric.latest.competence > competence) continue;

      const current = metricMap.get(storedMetric.id) ?? metricForResponse(storedMetric);
      if (!metricMap.has(storedMetric.id)) {
        current.latest = null;
        current.history = [];
        metricMap.set(storedMetric.id, current);
      }

      const historicPoint = current.history.find(
        (point) => point.competence === storedMetric.latest.competence,
      );
      if (!historicPoint) {
        current.history.push({ ...storedMetric.latest });
        continue;
      }

      historicPoint.numerator += storedMetric.latest.numerator;
      historicPoint.denominator += storedMetric.latest.denominator;
      historicPoint.available ||= storedMetric.latest.available;
      historicPoint.zeroPark &&= storedMetric.latest.zeroPark;
      historicPoint.value =
        historicPoint.available && historicPoint.denominator > 0
          ? historicPoint.numerator / historicPoint.denominator
          : null;
    }
  }

  return {
    rows,
    metrics: [...metricMap.values()].map((metric) => {
      const history = metric.history
        .sort((left, right) => left.competence.localeCompare(right.competence))
        .map((point) => withMetricScore(point, metric.scoreRules))
        .filter((point): point is NonNullable<QscMetricSeries["latest"]> => point !== null);

      return {
        ...metric,
        history,
        latest: history.find((point) => point?.competence === competence) ?? null,
      };
    }),
  };
}

export const Route = createFileRoute("/api/qsc")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const user = await readAuthUser();
        if (!user || user.role === "admin") {
          return Response.json({ message: "Acesso não autorizado." }, { status: 403 });
        }
        const qscSnapshot = await readQscSnapshot();
        const competence = currentCompetence(qscSnapshot);
        const url = new URL(request.url);
        const requestedIds = url.searchParams.getAll("partner");
        const availableIds = new Set(qscSnapshot.partners.map((partner) => partner.id));
        const authorizedIds =
          user.role === "gn"
            ? new Set(user.partnerIds.filter((id) => availableIds.has(id)))
            : availableIds;
        const selectedIds = [
          ...new Set(
            (requestedIds.length ? requestedIds : [...authorizedIds]).filter((id) =>
              authorizedIds.has(id),
            ),
          ),
        ];
        const hasPartnerFilter = user.role === "gn" || requestedIds.length > 0;
        const selectedPartners = hasPartnerFilter
          ? qscSnapshot.partners.filter((partner) => selectedIds.includes(partner.id))
          : qscSnapshot.partners;

        let metrics: QscMetricSeries[] = [];
        let rows = 0;

        if (!hasPartnerFilter || selectedIds.length === qscSnapshot.partners.length) {
          const scope = qscSnapshot.scopes.find((item) => item.id === ALL_SCOPE_ID);
          metrics = metricsForScope(scope, competence);
          rows = scope?.rowsByCompetence[competence as keyof typeof scope.rowsByCompetence] ?? 0;
        } else if (selectedIds.length === 1) {
          const scope = qscSnapshot.scopes.find((item) => item.id === selectedIds[0]);
          metrics = metricsForScope(scope, competence);
          rows = scope?.rowsByCompetence[competence as keyof typeof scope.rowsByCompetence] ?? 0;
        } else if (selectedIds.length > 1) {
          ({ metrics, rows } = aggregateScopes(qscSnapshot, selectedIds, competence));
        }

        const payload: QscApiResponse = {
          competence,
          available: metrics.length > 0,
          calculatedAt: qscSnapshot.importedAt,
          updateFrequency: qscSnapshot.updateFrequency,
          rows,
          partners: selectedPartners,
          metrics,
        };

        return Response.json(payload, {
          headers: {
            "Cache-Control": "no-cache, max-age=0, must-revalidate",
          },
        });
      },
    },
  },
});
