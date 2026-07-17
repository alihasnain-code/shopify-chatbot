import "@shopify/shopify-app-react-router/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
} from "@shopify/shopify-app-react-router/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";
import { ensureDefaultShopSettings } from "./models/onboarding.server";
import { policySyncQueue } from "./queue";

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.April26,
  scopes: process.env.SCOPES?.split(","),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prisma),
  distribution: AppDistribution.AppStore,
  future: {
    expiringOfflineAccessTokens: true,
  },
  hooks: {
    afterAuth: async ({ session, admin }) => {
      await shopify.registerWebhooks({ session });

      // 1. Seed default AI persona / starter questions / usage settings for this session
      await ensureDefaultShopSettings(session.id);

      // 2. Dispatch background job to fetch, chunk, embed, and store policies
      await policySyncQueue.add(
        "sync-store-policies",
        { shop: session.shop }, // Payload needed by the worker
        {
          attempts: 3, // Retry up to 3 times if Shopify API or embedding fails
          backoff: {
            type: "exponential",
            delay: 5000, // Wait 5s before 1st retry, 10s for 2nd, etc.
          },
          removeOnComplete: true, // Clean up Redis storage when successfully parsed
          removeOnFail: false,    // Keep failures around so you can debug the error logs
        }
      );

      console.log(`[BullMQ] Enqueued policy sync for: ${session.shop}`);
    }
  },
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
});

export default shopify;
export const apiVersion = ApiVersion.April26;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
