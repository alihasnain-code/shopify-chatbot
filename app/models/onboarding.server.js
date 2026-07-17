import db from "../db.server";

const DEFAULT_STARTER_QUESTIONS = [
    "What products can I browse in your store?",
    "What's your return and shipping policy?",
    "How do I add an item to my cart?",
    "How do I complete my purchase?",
];

const DEFAULT_FORM_NAME = "Lead Capture Form";

const DEFAULT_FORM_FIELDS = [
    {
        id: "first_name",
        label: "First Name",
        type: "text",
        placeholder: "Enter your first name",
        options: [],
        required: true,
    },
    {
        id: "last_name",
        label: "Last Name",
        type: "text",
        placeholder: "Enter your last name",
        options: [],
        required: true,
    },
    {
        id: "email",
        label: "Email",
        type: "email",
        placeholder: "Enter your email",
        options: [],
        required: true,
    },
    {
        id: "privacy_consent",
        label: "By joining the chat, you accept our Privacy Policy.",
        type: "checkbox",
        placeholder: "",
        options: [],
        required: true,
    },
];

export async function ensureDefaultShopSettings(sessionId) {
    await db.aipersonasettings.upsert({
        where: { sessionId },
        create: { sessionId, customInstructions: null, tone: "standard" },
        update: {},
    });

    await db.usagesettings.upsert({
        where: { sessionId },
        create: {
            sessionId,
            maxMessagesPerConversation: 15,
            maxMessagesPerVisitor: 100,
            resetPeriod: "hour",
        },
        update: {},
    });

    const existingQuestions = await db.starterquestion.count({ where: { sessionId } });
    if (existingQuestions === 0) {
        await db.starterquestion.createMany({
            data: DEFAULT_STARTER_QUESTIONS.map((question, index) => ({
                sessionId,
                question,
                position: index,
            })),
        });
    }

    // Seed a default lead-capture form. Guarded by name (not "any form exists")
    // so this specific default gets re-created if the merchant deletes it but
    // keeps other custom forms — matches Form's @@unique([sessionId, name]).
    const existingDefaultForm = await db.form.findFirst({
        where: { sessionId, name: DEFAULT_FORM_NAME },
    });

    if (!existingDefaultForm) {
        const lastForm = await db.form.findFirst({
            where: { sessionId },
            orderBy: { position: "desc" },
        });

        await db.form.create({
            data: {
                sessionId,
                name: DEFAULT_FORM_NAME,
                status: "active",
                fields: JSON.stringify(DEFAULT_FORM_FIELDS),
                position: lastForm ? lastForm.position + 1 : 0,
            },
        });
    }
}