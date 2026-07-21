import { authenticate } from "../shopify.server";
import { upsertFulfillmentFromWebhook } from "../services/order-tracking.server";

export const action = async ({ request }) => {
    const { shop, topic, payload } = await authenticate.webhook(request);

    console.log(`Received ${topic} webhook for ${shop}`);

    await upsertFulfillmentFromWebhook(payload);

    return new Response();
};