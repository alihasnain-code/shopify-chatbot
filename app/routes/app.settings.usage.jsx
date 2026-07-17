import { useLoaderData, useActionData, useSubmit, useNavigation } from "react-router";
import { useState, useEffect } from "react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import db from "../db.server";

const ALLOWED_RESET_PERIODS = ["hour", "6-hour", "12-hour", "24-hour", "7-day"];

export const loader = async ({ request }) => {
    const { session } = await authenticate.admin(request);

    return db.usagesettings.upsert({
        where: { sessionId: session.id },
        create: { sessionId: session.id },
        update: {},
    });
};

export const action = async ({ request }) => {
    const { session } = await authenticate.admin(request);

    const formData = await request.formData();
    const maxMessagesPerConversation = parseInt(formData.get("maxMessagesPerConversation"), 10);
    const maxMessagesPerVisitor = parseInt(formData.get("maxMessagesPerVisitor"), 10);
    const resetPeriod = formData.get("resetPeriod");

    if (!Number.isInteger(maxMessagesPerConversation) || maxMessagesPerConversation < 1 || maxMessagesPerConversation > 200) {
        return { error: "Max messages per chat conversation must be between 1 and 200." };
    }

    if (!Number.isInteger(maxMessagesPerVisitor) || maxMessagesPerVisitor < 1 || maxMessagesPerVisitor > 10000) {
        return { error: "Max total messages per visitor must be between 1 and 10000." };
    }

    if (!ALLOWED_RESET_PERIODS.includes(resetPeriod)) {
        return { error: "Invalid reset period selected." };
    }

    await db.usagesettings.upsert({
        where: { sessionId: session.id },
        create: { sessionId: session.id, maxMessagesPerConversation, maxMessagesPerVisitor, resetPeriod },
        update: { maxMessagesPerConversation, maxMessagesPerVisitor, resetPeriod },
    });

    return { success: true };
};

export default function Usage() {
    const settings = useLoaderData();
    const actionData = useActionData();
    const navigation = useNavigation();
    const submit = useSubmit();

    const [initialFormState, setInitialFormState] = useState(settings);
    const [formState, setFormState] = useState(settings);

    const isSaving = navigation.state === "submitting";
    const isDirty = JSON.stringify(formState) !== JSON.stringify(initialFormState);

    function handleSave(e) {
        e.preventDefault();
        submit(
            {
                maxMessagesPerConversation: String(formState.maxMessagesPerConversation),
                maxMessagesPerVisitor: String(formState.maxMessagesPerVisitor),
                resetPeriod: formState.resetPeriod,
            },
            { method: "post" }
        );
    }

    function handleReset() {
        setFormState(initialFormState);
    }

    useEffect(() => {
        const saveBar = document.getElementById("usage-save-bar");
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
            <ui-save-bar id="usage-save-bar">
                <button variant="primary" disabled={isSaving} loading={isSaving ? "" : false} type="submit"></button>
                <button disabled={isSaving} onClick={handleReset} type="button"></button>
            </ui-save-bar>

            <s-section heading="Usage Controls & Anti-Abuse">
                <s-stack direction="block" gap="small">
                    <s-number-field
                        autocomplete="off"
                        value={formState.maxMessagesPerConversation}
                        onInput={(e) => setFormState({ ...formState, maxMessagesPerConversation: e.currentTarget.value })}
                        required
                        min={1}
                        max={200}
                        details="Limits length of a single conversation thread."
                        label="Max messages per chat conversation"
                    ></s-number-field>
                    <div
                        style={{
                            display: "grid",
                            gap: "10px",
                            gridTemplateColumns: "repeat(2, 1fr)",
                        }}
                    >
                        <s-number-field
                            required
                            autocomplete="off"
                            value={formState.maxMessagesPerVisitor}
                            onInput={(e) => setFormState({ ...formState, maxMessagesPerVisitor: e.currentTarget.value })}
                            min={1}
                            max={10000}
                            label="Max total messages per visitor"
                        ></s-number-field>
                        <s-select
                            label="Reset period"
                            name="reset-period"
                            value={formState.resetPeriod}
                            onChange={(e) => setFormState({ ...formState, resetPeriod: e.currentTarget.value })}
                        >
                            <s-option value="hour">1 Hour</s-option>
                            <s-option value="6-hour">6 Hour</s-option>
                            <s-option value="12-hour">12 Hour</s-option>
                            <s-option value="24-hour">24 Hour</s-option>
                            <s-option value="7-day">7 Days</s-option>
                        </s-select>
                    </div>

                    <s-text color="subdued">Total messages allowed across all conversations within the selected window.</s-text>
                </s-stack>
            </s-section>
        </form>
    );
}

export const headers = (headersArgs) => boundary.headers(headersArgs);