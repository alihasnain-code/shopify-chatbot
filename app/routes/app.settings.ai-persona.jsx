import { useLoaderData, useActionData, useSubmit, useNavigation, useFetcher, useRevalidator } from "react-router";
import { useState, useEffect } from "react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import db from "../db.server";
import { formatDate } from "../utils";
import { policySyncQueue } from "../queue";

const ALLOWED_TONES = ["standard", "enthusiastic"];
const MAX_INSTRUCTIONS_LENGTH = 2000;

export const loader = async ({ request }) => {
    const { session } = await authenticate.admin(request);

    const [personaSettings, userConfig] = await Promise.all([
        db.aipersonasettings.upsert({
            where: { sessionId: session.id },
            create: { sessionId: session.id },
            update: {},
        }),
        db.user_configs.upsert({
            where: { sessionId: session.id },
            create: { sessionId: session.id },
            update: {},
        }),
    ]);

    return {
        ...personaSettings,
        policiesStatus: userConfig.policiesStatus,
        lastSyncedAt: userConfig.lastSyncedAt,
    };
};

export const action = async ({ request }) => {
    const { session } = await authenticate.admin(request);
    const formData = await request.formData();
    const actionType = formData.get("_action");

    // Manual "Sync Policies Now" — dispatches into the exact same BullMQ
    // job/queue as the first-time afterAuth sync, so policySyncWorker.js
    // handles both cases identically.
    if (actionType === "syncPolicies") {
        const existing = await db.user_configs.upsert({
            where: { sessionId: session.id },
            create: { sessionId: session.id },
            update: {},
        });

        if (existing.policiesStatus === "IN_PROGRESS") {
            return { syncError: "A sync is already in progress." };
        }

        // Optimistically flip to IN_PROGRESS immediately so the UI can
        // disable the button right away, without waiting for the worker
        // to pick the job up off the queue.
        await db.user_configs.update({
            where: { sessionId: session.id },
            data: { policiesStatus: "IN_PROGRESS" },
        });

        await policySyncQueue.add(
            "sync-store-policies",
            { shop: session.shop },
            {
                attempts: 3,
                backoff: { type: "exponential", delay: 5000 },
                removeOnComplete: true,
                removeOnFail: false,
            }
        );

        return { syncStarted: true };
    }

    const customInstructions = (formData.get("customInstructions"))?.trim() || null;
    const tone = formData.get("tone");

    if (customInstructions && customInstructions.length > MAX_INSTRUCTIONS_LENGTH) {
        return { error: `Custom instructions must be ${MAX_INSTRUCTIONS_LENGTH} characters or fewer.` };
    }

    if (!ALLOWED_TONES.includes(tone)) {
        return { error: "Invalid tone selected." };
    }

    await db.aipersonasettings.upsert({
        where: { sessionId: session.id },
        create: { sessionId: session.id, customInstructions, tone },
        update: { customInstructions, tone },
    });

    return { success: true };
};

const STATUS_BADGE = {
    SYNCED: { tone: "success", label: "SYNCED" },
    IN_PROGRESS: { tone: "info", label: "SYNCING…" },
    FAILED: { tone: "critical", label: "FAILED" },
};

export default function AiPersona() {
    const settings = useLoaderData();
    const actionData = useActionData();
    const navigation = useNavigation();
    const submit = useSubmit();
    const revalidator = useRevalidator();
    const syncFetcher = useFetcher();

    // Only the persona fields belong in editable form state — sync status
    // comes straight from the loader so it stays fresh across revalidations.
    const { customInstructions, tone } = settings;
    const [initialFormState, setInitialFormState] = useState({ customInstructions, tone });
    const [formState, setFormState] = useState({ customInstructions, tone });

    const isSaving = navigation.state === "submitting";
    const isDirty = JSON.stringify(formState) !== JSON.stringify(initialFormState);

    const policiesStatus = settings.policiesStatus;
    const isSyncing = policiesStatus === "IN_PROGRESS" || syncFetcher.state !== "idle";
    const badge = STATUS_BADGE[policiesStatus] ?? STATUS_BADGE.SYNCED;

    function handleSyncNow() {
        syncFetcher.submit({ _action: "syncPolicies" }, { method: "post" });
    }

    // While a sync is in progress, poll so the badge/timestamp flip to
    // SYNCED/FAILED once the background worker finishes — the worker updates
    // the DB directly, so this page has no other way to know it's done.
    useEffect(() => {
        if (policiesStatus !== "IN_PROGRESS") return;
        const interval = setInterval(() => revalidator.revalidate(), 3000);
        return () => clearInterval(interval);
    }, [policiesStatus]);

    useEffect(() => {
        if (syncFetcher.data?.syncStarted) {
            window.shopify.toast.show("Policy sync started", { duration: 3000 });
            revalidator.revalidate();
        }
        if (syncFetcher.data?.syncError) {
            window.shopify.toast.show(syncFetcher.data.syncError, { isError: true, duration: 3000 });
        }
    }, [syncFetcher.data]);

    function handleSave(e) {
        e.preventDefault();
        submit(
            {
                customInstructions: formState.customInstructions || "",
                tone: formState.tone,
            },
            { method: "post" }
        );
    }

    function handleReset() {
        setFormState(initialFormState);
    }

    useEffect(() => {
        const saveBar = document.getElementById("ai-persona-save-bar");
        if (!saveBar) return;
        isDirty ? saveBar.show() : saveBar.hide();
    }, [isDirty]);

    useEffect(() => {
        if (actionData?.success) {
            window.shopify.toast.show("Settings saved", { duration: 3000 });
            setInitialFormState(formState);
        }
        if (actionData?.error) {
            window.shopify.toast.show(actionData.error, { isError: true, duration: 3000 });
        }
    }, [actionData]);

    return (
        <form onSubmit={handleSave}>
            <ui-save-bar id="ai-persona-save-bar">
                <button variant="primary" disabled={isSaving} loading={isSaving ? "" : false} type="submit"></button>
                <button disabled={isSaving} onClick={handleReset} type="button"></button>
            </ui-save-bar>

            <s-section heading="AI Persona & Custom Instructions">
                <s-text-area
                    autocomplete="off"
                    details={`Write clear rules or store context to direct the AI's responses. Optional — leave blank to use the default persona.`}
                    label="Custom System Instructions"
                    placeholder="e.g., You are a friendly customer support agent for [Store Name]. Help customers track orders, check sizing, and answer store policy questions. Always maintain a helpful tone and do not discuss competitor brands."
                    rows={5}
                    maxLength={MAX_INSTRUCTIONS_LENGTH}
                    value={formState.customInstructions || ""}
                    onInput={(e) => setFormState({ ...formState, customInstructions: e.currentTarget.value })}
                ></s-text-area>
                <s-select
                    label="AI Tone of Voice"
                    details="Controls the emotional delivery and style of responses generated by the AI."
                    value={formState.tone}
                    onChange={(e) => setFormState({ ...formState, tone: e.currentTarget.value })}
                >
                    <s-option value="standard">Standard & Professional</s-option>
                    <s-option value="enthusiastic">Enthusiastic & Friendly</s-option>
                </s-select>
            </s-section>
            <br />
            <s-section heading="Policy Knowledge Base Sync">
                <s-stack direction="inline" justifyContent="space-between" alignItems="center">
                    <s-stack direction="block" gap="small-100">
                        <s-stack direction="inline" gap="small-100" alignItems="center">
                            <s-text type="strong">Status:</s-text>
                            <s-badge tone={badge.tone}>{badge.label}</s-badge>
                        </s-stack>
                        <s-text color="subdued">
                            {/* Last Synced: {settings.lastSyncedAt ? formatDate(new Date(settings.lastSyncedAt).toLocaleString()) : "Never"} */}
                            Last Synced: {settings.lastSyncedAt ? formatDate(settings.lastSyncedAt) : "Never"}
                        </s-text>
                    </s-stack>

                    <s-button
                        type="button"
                        variant="primary"
                        tone="neutral"
                        disabled={isSyncing}
                        loading={isSyncing ? true : false}
                        onClick={handleSyncNow}
                    >
                        {isSyncing ? "Syncing…" : "Sync Policies Now"}
                    </s-button>
                </s-stack>
            </s-section>
        </form >
    );
}

export const headers = (headersArgs) => boundary.headers(headersArgs);