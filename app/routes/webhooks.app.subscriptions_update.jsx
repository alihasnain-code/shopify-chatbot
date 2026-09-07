import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const action = async ({ request }) => {
    const { payload, shop, topic } = await authenticate.webhook(request);

    if (topic !== "APP_SUBSCRIPTIONS_UPDATE") {
        return new Response("Unhandled webhook topic", { status: 400 });
    }

    const subscription = payload.app_subscription;
    if (!subscription) {
        return new Response("Missing subscription data", { status: 400 });
    }

    const chargeId = BigInt(subscription.admin_graphql_api_id.split("/").pop());
    const status = subscription.status;
    const planName = subscription.name;

    console.log(`[Webhook] Processing ${planName} - Status: ${status} for ${shop}`);

    const shopSessions = await prisma.session.findMany({ where: { shop } });
    if (shopSessions.length === 0) {
        return new Response("Store session not found", { status: 200 });
    }

    const primarySession = shopSessions[0];
    const targetPlan = await prisma.plan.findUnique({ where: { name: planName } });

    if (!targetPlan) {
        console.log(`[Webhook] Error: Plan '${planName}' not found.`);
        return new Response("Plan not found", { status: 200 });
    }

    // 1. Upsert the specific charge that triggered this webhook
    const existingCharge = await prisma.charges.findFirst({ where: { chargeId } });

    if (existingCharge) {
        await prisma.charges.update({
            where: { id: existingCharge.id },
            data: {
                status,
                updatedAt: new Date(),
                trialDays: 0,
                interval: "EVERY_30_DAYS",
                ...(status === "CANCELLED" ? { cancelledOn: new Date() } : {}),
                ...(status === "ACTIVE" ? { activatedOn: new Date() } : {}),
            },
        });
    } else {
        await prisma.charges.create({
            data: {
                chargeId,
                status,
                name: planName,
                type: "EVERY_30_DAYS",
                price: targetPlan.price,
                sessionId: primarySession.id,
                planId: targetPlan.id,
                test: subscription.test ?? false,
                trialDays: 0,
                interval: "EVERY_30_DAYS",
                ...(status === "ACTIVE" ? { activatedOn: new Date() } : {}),
            },
        });
    }

    // 2. State-Derived Reconciliation
    const activeCharge = await prisma.charges.findFirst({
        where: {
            sessionId: primarySession.id,
            status: { in: ["ACTIVE", "TRIAL"] },
        },
        orderBy: { updatedAt: "desc" },
    });

    if (activeCharge) {
        console.log(`[Webhook] Active charge found. Syncing session(s) to Plan ID: ${activeCharge.planId}`);

        await Promise.all(
            shopSessions.map(async (session) => {
                const isNewPlan = session.planId !== activeCharge.planId;
                const resetDate = new Date();
                resetDate.setDate(resetDate.getDate() + 30);

                await prisma.session.update({
                    where: { id: session.id },
                    data: {
                        planId: activeCharge.planId,
                        ...(isNewPlan ? { tokensUsed: 0, usageResetAt: resetDate } : {}),
                    },
                });
            })
        );
    } else {
        console.log(`[Webhook] No active charges found. Downgrading session(s) to Free Plan.`);
        const freePlan = await prisma.plan.findFirst({ where: { onInstall: true } });

        await Promise.all(
            shopSessions.map((session) =>
                prisma.session.update({
                    where: { id: session.id },
                    data: {
                        planId: freePlan?.id ?? null,
                    },
                })
            )
        );
    }

    console.log(`[Webhook] Successfully completed for ${shop}`);
    return new Response("Webhook processed", { status: 200 });
};