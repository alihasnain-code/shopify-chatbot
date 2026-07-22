import { authenticate } from "../shopify.server";
import { upsertOrderFromWebhook } from "../services/order-tracking.server";

export const action = async ({ request }) => {
    const { shop, topic, payload } = await authenticate.webhook(request);

    console.log(`Received ${topic} webhook for ${shop}`);

    // Same Order resource shape as create/updated — payload.cancelled_at and
    // payload.cancel_reason are just populated this time.
    await upsertOrderFromWebhook(shop, payload);

    return new Response();
};