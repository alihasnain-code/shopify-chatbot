import { useFetcher, useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server";

async function getAppHandle(admin) {
    const response = await admin.graphql(`#graphql
    query {
      currentAppInstallation {
        app {
          handle
        }
      }
    }
  `);
    const { data } = await response.json();
    return data.currentAppInstallation.app.handle;
}

export const loader = async ({ request }) => {
    const { session } = await authenticate.admin(request);

    const [plans, dbSession] = await Promise.all([
        prisma.plan.findMany({ orderBy: { price: "asc" } }),
        prisma.session.findUnique({ where: { id: session.id } }),
    ]);

    // Decimal/BigInt don't serialize cleanly across the loader boundary — flatten them.
    const serializedPlans = plans.map((plan) => ({
        ...plan,
        price: Number(plan.price),
        cappedAmount: plan.cappedAmount ? Number(plan.cappedAmount) : null,
    }));

    return {
        plans: serializedPlans,
        currentPlanId: dbSession?.planId ?? null,
        tokensUsed: dbSession?.tokensUsed ?? 0,
    };
};

export const action = async ({ request }) => {
    const { billing, session, admin } = await authenticate.admin(request);
    const formData = await request.formData();
    const intent = formData.get("intent");

    if (intent === "activate") {
        const planId = Number(formData.get("planId"));
        const targetPlan = await prisma.plan.findUniqueOrThrow({ where: { id: planId } });

        if (Number(targetPlan.price) === 0) {
            await prisma.session.update({
                where: { id: session.id },
                data: { planId: targetPlan.id },
            });
            return { ok: true };
        }

        const appHandle = await getAppHandle(admin);
        const storeHandle = session.shop.replace(".myshopify.com", "");

        return billing.request({
            plan: targetPlan.name,
            isTest: targetPlan.test,
            trialDays: targetPlan.trialDays ?? 0,
            returnUrl: `https://admin.shopify.com/store/${storeHandle}/apps/${appHandle}/app`,
        });
    }

    if (intent === "cancel") {
        const activeCharge = await prisma.charges.findFirst({
            where: { sessionId: session.id, status: { in: ["ACTIVE", "TRIAL"] } },
            orderBy: { createdAt: "desc" },
        });

        if (activeCharge) {
            await billing.cancel({
                subscriptionId: `gid://shopify/AppSubscription/${activeCharge.chargeId}`,
                isTest: activeCharge.test,
                prorate: true,
            });

            const freePlan = await prisma.plan.findFirst({ where: { onInstall: true } });

            await prisma.$transaction([
                prisma.charges.update({
                    where: { id: activeCharge.id },
                    data: { status: "CANCELLED", cancelledOn: new Date() },
                }),
                prisma.session.update({
                    where: { id: session.id },
                    data: { planId: freePlan?.id ?? null },
                }),
            ]);
        }

        return { ok: true };
    }

    return { ok: false };
};

function featureLabels(features) {
    if (!features) return [];
    const labels = {
        translation: "Translation",
        autoTranslate: "Auto translate",
        orderDetails: "Order details",
        cartFeature: "Cart feature",
        productExplore: "Product explore",
        personalization: "Personalization",
    };
    return Object.entries(features)
        .filter(([, enabled]) => enabled)
        .map(([key]) => labels[key] ?? key);
}

export default function Plans() {
    const { plans, currentPlanId, tokensUsed } = useLoaderData();
    const fetcher = useFetcher();
    const isBusy = fetcher.state !== "idle";
    const pendingPlanId = fetcher.formData?.get("planId");
    const pendingIntent = fetcher.formData?.get("intent");

    const handleActivate = (planId) => {
        if (isBusy) return;
        fetcher.submit({ intent: "activate", planId: String(planId) }, { method: "post" });
    };

    const handleCancel = (planId) => {
        if (isBusy) return;
        fetcher.submit({ intent: "cancel", planId: String(planId) }, { method: "post" });
    };

    // Calculate dynamic usage data
    const currentPlan = plans.find((p) => p.id === currentPlanId);
    const currentIndex = plans.findIndex((p) => p.id === currentPlanId);
    const nextPlan = currentIndex !== -1 ? plans[currentIndex + 1] : plans[0];
    const isMostAdvancedPlan = currentIndex !== -1 && currentIndex === plans.length - 1;

    const planName = currentPlan ? currentPlan.name : "Free";
    const tokenLimit = currentPlan?.tokenLimit || 0;
    const hasLimit = tokenLimit > 0;

    let percentage = 0;
    if (hasLimit) {
        percentage = Math.round((tokensUsed / tokenLimit) * 100);
        percentage = Math.min(percentage, 100); // Cap visually at 100%
    }

    return (
        <s-page heading="Plans">
            <s-section>
                <s-stack direction="block" gap="base">
                    <s-stack direction="inline" alignItems="center" gap="base">
                        <s-heading type="strong">Current plan: {planName}</s-heading>
                        <s-badge tone="success" color="base">Active</s-badge>
                    </s-stack>

                    {hasLimit ? (
                        <>
                            <s-text tone="neutral" color="subdued">
                                Usage: {percentage}% of monthly token limit
                            </s-text>

                            <s-stack direction="block" gap="base">
                                <s-stack direction="inline" justifyContent="space-between" alignItems="center">
                                    <s-text tone="neutral" color="subdued">Usage</s-text>
                                    <s-text tone="neutral" color="subdued">
                                        {tokensUsed.toLocaleString()} / {tokenLimit.toLocaleString()} tokens
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
                        <s-stack direction="inline" justifyContent="space-between" alignItems="center">
                            <s-text tone="neutral" color="subdued">
                                Consider upgrading if you expect higher volume.
                            </s-text>
                            <s-button
                                variant="primary"
                                tone="auto"
                                disabled={isBusy || !nextPlan || undefined}
                                onClick={() => nextPlan && handleActivate(nextPlan.id)}
                            >
                                {isBusy && pendingIntent === "activate" && Number(pendingPlanId) === nextPlan?.id
                                    ? "Upgrading…"
                                    : "Upgrade plan"}
                            </s-button>
                        </s-stack>
                    )}
                </s-stack>
            </s-section>

            <s-section heading="Plans">
                <div className="plans-container">
                    {plans.map((plan) => {
                        const isCurrent = plan.id === currentPlanId;
                        const isFree = Number(plan.price) === 0;
                        const thisButtonBusy = isBusy && Number(pendingPlanId) === plan.id;

                        return (
                            <s-box
                                key={plan.id}
                                padding="base"
                                border="base"
                                borderRadius="base"
                                background={isCurrent ? "success-subdued" : "subdued"}
                            >
                                <s-stack direction="block" gap="base">
                                    <s-stack direction="inline" alignItems="center" gap="base">
                                        <s-heading>{plan.name}</s-heading>
                                        <s-text tone="neutral" color="subdued">per month</s-text>
                                        {isCurrent && <s-badge tone="success">Current plan</s-badge>}
                                    </s-stack>

                                    <s-divider></s-divider>

                                    <s-stack direction="inline" alignItems="baseline" gap="base">
                                        <s-heading>${plan.price}</s-heading>
                                    </s-stack>

                                    <s-text tone="subdued">
                                        {plan.tokenLimit
                                            ? `${plan.tokenLimit.toLocaleString()} tokens / month`
                                            : null}
                                    </s-text>

                                    <s-unordered-list>
                                        {featureLabels(plan.features).map((label) => (
                                            <s-list-item key={label}>{label}</s-list-item>
                                        ))}
                                    </s-unordered-list>

                                    <s-box>
                                        {isCurrent ? (
                                            !isFree ? (
                                                <s-button
                                                    variant="secondary"
                                                    inlinesize="fill"
                                                    disabled={isBusy || undefined}
                                                    onClick={() => handleCancel(plan.id)}
                                                >
                                                    {thisButtonBusy && pendingIntent === "cancel"
                                                        ? "Cancelling…"
                                                        : "Cancel plan"}
                                                </s-button>
                                            ) : (
                                                <s-button variant="secondary" inlinesize="fill" disabled>
                                                    Current plan
                                                </s-button>
                                            )
                                        ) : (
                                            <s-button
                                                variant="primary"
                                                inlinesize="fill"
                                                tone="auto"
                                                disabled={isBusy || undefined}
                                                onClick={() => handleActivate(plan.id)}
                                            >
                                                {thisButtonBusy && pendingIntent === "activate"
                                                    ? "Activating…"
                                                    : "Choose plan"}
                                            </s-button>
                                        )}
                                    </s-box>
                                </s-stack>
                            </s-box>
                        );
                    })}
                </div>
            </s-section>
        </s-page>
    );
}

export const headers = (headersArgs) => {
    return boundary.headers(headersArgs);
};