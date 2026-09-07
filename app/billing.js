import { BillingInterval } from "@shopify/shopify-app-react-router/server";

export const BILLING_CONFIG = {
    Starter: {
        lineItems: [
            {
                amount: 5,
                currencyCode: "USD",
                interval: BillingInterval.Every30Days,
            },
        ],
    },
    Growth: {
        lineItems: [
            {
                amount: 10,
                currencyCode: "USD",
                interval: BillingInterval.Every30Days,
            },
        ],
    },
    Pro: {
        lineItems: [
            {
                amount: 15,
                currencyCode: "USD",
                interval: BillingInterval.Every30Days,
            },
        ],
    },
    Scale: {
        lineItems: [
            {
                amount: 25,
                currencyCode: "USD",
                interval: BillingInterval.Every30Days,
            },
        ],
    },
};