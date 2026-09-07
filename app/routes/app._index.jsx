import { useLoaderData, useFetcher } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import {
  SubmissionsTrendChart,
  FormComparisonChart,
} from "../components/submission-charts";

const TREND_DAYS = 14;

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);

  const [plans, dbSession, forms, recentResponses] = await Promise.all([
    prisma.plan.findMany({ orderBy: { price: "asc" } }),
    prisma.session.findUnique({ where: { id: session.id } }),
    prisma.form.findMany({
      where: { sessionId: session.id },
      select: { id: true, name: true },
    }),
    prisma.form_response.findMany({
      where: {
        sessionId: session.id,
        createdAt: {
          gte: new Date(Date.now() - TREND_DAYS * 24 * 60 * 60 * 1000),
        },
      },
      select: { createdAt: true, formId: true },
    }),
  ]);

  const serializedPlans = plans.map((plan) => ({
    ...plan,
    price: Number(plan.price),
    cappedAmount: plan.cappedAmount ? Number(plan.cappedAmount) : null,
  }));

  // --- Trend: total responses per day, last 14 days ---
  const dayLabels = [];
  const dayCounts = {};
  for (let i = TREND_DAYS - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10); // YYYY-MM-DD
    dayLabels.push(
      d.toLocaleDateString(undefined, { month: "short", day: "numeric" })
    );
    dayCounts[key] = 0;
  }
  recentResponses.forEach((r) => {
    const key = r.createdAt.toISOString().slice(0, 10);
    if (key in dayCounts) dayCounts[key] += 1;
  });
  const trendValues = Object.values(dayCounts);

  // --- Per-form: total responses per form (all-time) ---
  const formCounts = await prisma.form_response.groupBy({
    by: ["formId"],
    where: { sessionId: session.id },
    _count: { id: true },
  });
  const countByFormId = Object.fromEntries(
    formCounts.map((f) => [f.formId, f._count.id])
  );
  const formLabels = forms.map((f) => f.name);
  const formValues = forms.map((f) => countByFormId[f.id] ?? 0);

  return {
    plans: serializedPlans,
    currentPlanId: dbSession?.planId ?? null,
    tokensUsed: dbSession?.tokensUsed ?? 0,
    trend: { labels: dayLabels, values: trendValues },
    formStats: { labels: formLabels, values: formValues },
  };
};

export const action = async ({ request }) => {
  await authenticate.admin(request);
  return null;
};

export default function Index() {
  const { plans, currentPlanId, tokensUsed, trend, formStats } =
    useLoaderData();
  const fetcher = useFetcher();
  const isBusy = fetcher.state !== "idle";
  const pendingIntent = fetcher.formData?.get("intent");

  const handleActivate = (planId) => {
    if (isBusy) return;
    fetcher.submit(
      { intent: "activate", planId: String(planId) },
      { method: "post", action: "/app/plans" }
    );
  };

  const currentPlan = plans.find((p) => p.id === currentPlanId);
  const currentIndex = plans.findIndex((p) => p.id === currentPlanId);
  const nextPlan = currentIndex !== -1 ? plans[currentIndex + 1] : plans[0];
  const isMostAdvancedPlan =
    currentIndex !== -1 && currentIndex === plans.length - 1;

  const planName = currentPlan ? currentPlan.name : "Free";
  const tokenLimit = currentPlan?.tokenLimit || 0;
  const hasLimit = tokenLimit > 0;

  let percentage = 0;
  if (hasLimit) {
    percentage = Math.round((tokensUsed / tokenLimit) * 100);
    percentage = Math.min(percentage, 100);
  }

  const hasAnyResponses = formStats.values.some((v) => v > 0);

  return (
    <s-page heading="Dashboard">
      <s-section>
        <s-stack direction="block" gap="base">
          <s-stack direction="inline" alignItems="center" gap="base">
            <s-heading type="strong">Current plan: {planName}</s-heading>
            <s-badge tone="success" color="base">
              Active
            </s-badge>
          </s-stack>

          {hasLimit ? (
            <>
              <s-text tone="neutral" color="subdued">
                Usage: {percentage}% of monthly token limit
              </s-text>
              <s-stack direction="block" gap="base">
                <s-stack
                  direction="inline"
                  justifyContent="space-between"
                  alignItems="center"
                >
                  <s-text tone="neutral" color="subdued">
                    Usage
                  </s-text>
                  <s-text tone="neutral" color="subdued">
                    {tokensUsed.toLocaleString()} /{" "}
                    {tokenLimit.toLocaleString()} tokens
                  </s-text>
                </s-stack>
                <div className="usage-progress-track">
                  <div
                    className="usage-progress-fill"
                    style={{ width: `${percentage}%` }}
                  ></div>
                </div>
                <s-text tone="neutral" color="subdued">
                  {percentage}% used
                </s-text>
              </s-stack>
            </>
          ) : (
            <s-text tone="neutral" color="subdued">
              Usage: {tokensUsed.toLocaleString()} tokens
            </s-text>
          )}

          {!isMostAdvancedPlan && (
            <s-stack
              direction="inline"
              justifyContent="space-between"
              alignItems="center"
            >
              <s-text tone="neutral" color="subdued">
                Consider upgrading if you expect higher volume.
              </s-text>
              <s-button
                variant="primary"
                tone="auto"
                disabled={isBusy || !nextPlan || undefined}
                onClick={() => nextPlan && handleActivate(nextPlan.id)}
              >
                {isBusy && pendingIntent === "activate"
                  ? "Upgrading…"
                  : "Upgrade plan"}
              </s-button>
            </s-stack>
          )}
        </s-stack>
      </s-section>

      <s-section heading="Submissions over time">
        <SubmissionsTrendChart labels={trend.labels} values={trend.values} />
      </s-section>

      <s-section heading="Submissions per form">
        {hasAnyResponses ? (
          <FormComparisonChart
            labels={formStats.labels}
            values={formStats.values}
          />
        ) : (
          <s-text tone="neutral" color="subdued">
            No form responses yet.
          </s-text>
        )}
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};