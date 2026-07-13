import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
    const { shop, topic, payload } = await authenticate.webhook(request);

    console.log(`Received ${topic} webhook for ${shop}`);

    const { admin_graphql_api_id, name } = payload;

    await db.orders.upsert({
        where: {
            shopifyOrderId: admin_graphql_api_id,
        },
        update: {
            orderName: name,
        },
        create: {
            shopifyOrderId: admin_graphql_api_id,
            orderName: name,
        }
    });

    return new Response();
};
