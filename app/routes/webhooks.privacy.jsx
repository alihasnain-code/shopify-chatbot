import { authenticate } from "../shopify.server";

export const action = async ({ request }) => {
    const { shop, topic } = await authenticate.webhook(request);

    console.log(`Privacy webhook ${topic} received for ${shop}`);

    switch (topic) {
        case "CUSTOMERS_DATA_REQUEST":
        case "CUSTOMERS_REDACT":
        case "SHOP_REDACT":
            return new Response(null, { status: 200 });
        default:
            return new Response("Unhandled topic", { status: 404 });
    }
};
