import db from '../db.server'

// Every webhook needs the offline session id to satisfy the sessionId FK —
// same lookup pattern used in form.controller.js / questions.controller.js.
async function getSessionIdForShop(shop) {
    const session = await db.session.findFirst({
        where: { shop, isOnline: false },
        select: { id: true },
    })
    return session?.id ?? null
}

// Only the fields the tracking bot ever needs — no full address, no phone,
// no customer object, no payment/discount internals.
function extractLineItems(lineItems = []) {
    return lineItems.map((li) => ({
        title: li.title,
        variantTitle: li.variant_title || null,
        quantity: li.quantity,
    }))
}

// City/province/country only — never street address or phone, even though
// the webhook payload includes them.
function extractAddress(address) {
    if (!address) return { city: null, province: null, country: null }
    return {
        city: address.city ?? null,
        province: address.province ?? null,
        country: address.country ?? null,
    }
}

// Used by orders/create, orders/updated, and orders/cancelled — all three
// deliver the same full Order resource shape, so one upsert handles all of
// them. orders/cancelled just happens to arrive with cancelled_at set.
export async function upsertOrderFromWebhook(shop, payload) {
    const sessionId = await getSessionIdForShop(shop)
    if (!sessionId) {
        // No installed offline session for this shop yet — nothing to link
        // the row to. Log and bail rather than crash the webhook (Shopify
        // will retry, but a missing session means retries won't help
        // anyway, so we just skip silently here).
        console.error(`No offline session found for shop ${shop}, skipping order webhook`)
        return
    }

    const { city, province, country } = extractAddress(payload.shipping_address)

    await db.order.upsert({
        where: { shopifyOrderId: String(payload.id) },
        create: {
            sessionId,
            shopifyOrderId: String(payload.id),
            orderNumber: payload.order_number,
            orderName: payload.name,
            email: payload.contact_email || payload.email || null,
            financialStatus: payload.financial_status || null,
            fulfillmentStatus: payload.fulfillment_status || null,
            currency: payload.currency || null,
            totalPrice: payload.current_total_price || payload.total_price || null,
            lineItems: JSON.stringify(extractLineItems(payload.line_items)),
            shippingCity: city,
            shippingProvince: province,
            shippingCountry: country,
            cancelledAt: payload.cancelled_at ? new Date(payload.cancelled_at) : null,
            cancelReason: payload.cancel_reason || null,
            shopifyCreatedAt: new Date(payload.created_at),
        },
        update: {
            financialStatus: payload.financial_status || null,
            fulfillmentStatus: payload.fulfillment_status || null,
            totalPrice: payload.current_total_price || payload.total_price || null,
            lineItems: JSON.stringify(extractLineItems(payload.line_items)),
            cancelledAt: payload.cancelled_at ? new Date(payload.cancelled_at) : null,
            cancelReason: payload.cancel_reason || null,
        },
    })
}

// Used by fulfillments/create and fulfillments/update — same Fulfillment
// resource shape for both.
export async function upsertFulfillmentFromWebhook(payload) {
    const order = await db.order.findUnique({
        where: { shopifyOrderId: String(payload.order_id) },
        select: { id: true },
    })

    if (!order) {
        // Fulfillment webhook arrived before the order webhook was
        // processed (race condition — Shopify doesn't guarantee delivery
        // order). Log and bail; the next fulfillments/update for the same
        // fulfillment will retry the link once the order row exists.
        console.error(
            `No local order found for shopifyOrderId ${payload.order_id}, skipping fulfillment webhook`
        )
        return
    }

    const trackingUrl = payload.tracking_url || payload.tracking_urls?.[0] || null

    await db.order_fulfillment.upsert({
        where: { shopifyFulfillmentId: String(payload.id) },
        create: {
            shopifyFulfillmentId: String(payload.id),
            orderId: order.id,
            status: payload.status || null,
            shipmentStatus: payload.shipment_status || null,
            trackingCompany: payload.tracking_company || null,
            trackingNumber: payload.tracking_number || null,
            trackingUrl,
            shopifyCreatedAt: new Date(payload.created_at),
            shopifyUpdatedAt: new Date(payload.updated_at),
        },
        update: {
            status: payload.status || null,
            shipmentStatus: payload.shipment_status || null,
            trackingCompany: payload.tracking_company || null,
            trackingNumber: payload.tracking_number || null,
            trackingUrl,
            shopifyUpdatedAt: new Date(payload.updated_at),
        },
    })
}

export default { upsertOrderFromWebhook, upsertFulfillmentFromWebhook }