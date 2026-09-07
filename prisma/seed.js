// prisma/seed.js
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Shared across every plan — stored once, referenced by all rows.
const SHARED_FEATURES = {
    translation: true,
    autoTranslate: true,
    orderDetails: true,
    cartFeature: true,
    productExplore: true,
    personalization: true,
};

// Adjust names if you already have specific ones in mind — these are just
// placeholders tied to price since the brief only gave price + token limits.
const PLANS = [
    { name: "Free", price: 0, tokenLimit: 100_000, onInstall: true },
    { name: "Starter", price: 5, tokenLimit: 1_000_000 },
    { name: "Growth", price: 10, tokenLimit: 10_000_000 },
    { name: "Pro", price: 15, tokenLimit: 15_000_000 },
    { name: "Scale", price: 25, tokenLimit: 25_000_000 },
];

// Flip this once, here, rather than in every plan row.
// You can still override an individual plan's `test` flag directly in the DB later.
const IS_TEST = process.env.NODE_ENV !== "production";

async function main() {
    for (const p of PLANS) {
        await prisma.plan.upsert({
            where: { name: p.name },
            update: {
                price: p.price,
                interval: "EVERY_30_DAYS",
                trialDays: 0,
                tokenLimit: p.tokenLimit,
                features: SHARED_FEATURES,
                onInstall: p.onInstall ?? false,
                test: IS_TEST,
            },
            create: {
                type: "RECURRING",
                name: p.name,
                price: p.price,
                interval: "EVERY_30_DAYS",
                trialDays: 0,
                tokenLimit: p.tokenLimit,
                features: SHARED_FEATURES,
                onInstall: p.onInstall ?? false,
                test: IS_TEST,
            },
        });
        console.log(`Seeded plan: ${p.name} ($${p.price}/mo, ${p.tokenLimit.toLocaleString()} tokens)`);
    }
}

main()
    .then(async () => {
        await prisma.$disconnect();
    })
    .catch(async (e) => {
        console.error(e);
        await prisma.$disconnect();
        process.exit(1);
    });