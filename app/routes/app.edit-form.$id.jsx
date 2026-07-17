import { useEffect, useState } from "react";
import {
    redirect,
    useActionData,
    useLoaderData,
    useNavigation,
    useNavigate,
    useSubmit
} from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import db from "../db.server";
import { FormFieldsEditor } from "../components/form-field-editor";

// NOTE: filename assumes react-router flat-routes dynamic segment syntax
// (app.edit-form.$id.tsx -> /app/edit-form/:id). Rename to match your
// routing convention if different.

export const loader = async ({ request, params }) => {
    const { session } = await authenticate.admin(request);

    const formId = Number(params.id);
    if (!formId || Number.isNaN(formId)) {
        throw new Response("Form not found", { status: 404 });
    }

    const form = await db.form.findFirst({
        where: { id: formId, sessionId: session.id },
    });

    if (!form) {
        throw new Response("Form not found", { status: 404 });
    }

    return {
        form: {
            id: form.id,
            name: form.name,
            status: form.status,
            fields: (JSON.parse(form.fields)) || [],
        },
    };
};

// Checks every committed field has a label, and that dropdown fields have
// at least one non-empty option. Runs server-side as the source of truth —
// the Add Field modal also checks this client-side, but the fields array
// arrives here as raw JSON and could be tampered with or submitted without JS.
function validateFields(fields) {
    for (let i = 0; i < fields.length; i++) {
        const field = fields[i];
        if (!field.label || String(field.label).trim().length === 0) {
            return `Field ${i + 1} is missing a label.`;
        }
        if (
            field.type === "dropdown" &&
            (!field.options || field.options.filter((option) => option.trim().length > 0).length === 0)
        ) {
            return `Field "${field.label}" is a dropdown and needs at least one option.`;
        }
    }
    return undefined;
}

export const action = async ({ request, params }) => {
    const { session } = await authenticate.admin(request);

    const formId = Number(params.id);
    if (!formId || Number.isNaN(formId)) {
        throw new Response("Form not found", { status: 404 });
    }

    const formData = await request.formData();
    const intent = String(formData.get("intent") || "update");

    if (intent === "delete") {
        await db.form.deleteMany({
            where: { id: formId, sessionId: session.id },
        });
        return redirect("/app/forms");
    }

    const name = String(formData.get("name") || "").trim();
    const status = String(formData.get("status") || "active");
    const fields = JSON.parse(String(formData.get("fields") || "[]"));

    const errors = {};

    if (!name) {
        errors.name = "Form name is required.";
    } else {
        // Form names must be unique per session (case-sensitive), excluding this form itself.
        const existing = await db.form.findFirst({
            where: { sessionId: session.id, name, id: { not: formId } },
        });
        if (existing) {
            errors.name = "A form with this name already exists.";
        }
    }

    const fieldsError = validateFields(fields);
    if (fieldsError) {
        errors.fields = fieldsError;
    }

    if (errors.name || errors.fields) {
        return { errors };
    }

    const result = await db.form.updateMany({
        where: { id: formId, sessionId: session.id },
        data: { name, status, fields: JSON.stringify(fields) },
    });

    if (result.count === 0) {
        throw new Response("Form not found", { status: 404 });
    }

    return { success: true };
};

// Unique id for this page's save bar element, per Shopify's <ui-save-bar> API.
const SAVE_BAR_ID = "edit-form-save-bar";

export default function Index() {
    const { form } = useLoaderData();
    const actionData = useActionData();
    const navigation = useNavigation();
    const submit = useSubmit();
    const navigate = useNavigate();
    const isSaving = navigation.state === "submitting";

    const [name, setName] = useState(form.name);
    const [status, setStatus] = useState(form.status);
    const [fields, setFields] = useState(form.fields);
    const [isDirty, setIsDirty] = useState(false);

    useEffect(() => {
        // Check if the action returned { success: true }
        if (actionData && 'success' in actionData && actionData.success) {
            // 1. Tell Shopify to hide the bar
            shopify.saveBar.hide(SAVE_BAR_ID);
            setIsDirty(false);

            navigate("/app/forms");
        }
    }, [actionData, navigate]);

    // Keep local state in sync if the loader re-runs with fresh data
    // (e.g. after a successful save), and clear the dirty flag/save bar
    // since whatever's loaded is now the "saved" baseline.
    useEffect(() => {
        setName(form.name);
        setStatus(form.status);
        setFields(form.fields);
        setIsDirty(false);
        shopify.saveBar.hide(SAVE_BAR_ID);
    }, [form]);

    // If the action comes back with validation errors, nothing was
    // actually persisted — keep the save bar visible so the merchant
    // can fix the issue and try again instead of losing their edits.
    useEffect(() => {
        if (actionData?.errors) {
            setIsDirty(true);
            shopify.saveBar.show(SAVE_BAR_ID);
        }
    }, [actionData]);

    // We use the programmatic <ui-save-bar> + shopify.saveBar API rather
    // than the data-save-bar form attribute. data-save-bar only detects
    // changes via native input/change DOM events, but the fields list
    // (add/delete/reorder) lives purely in React state and is never
    // driven by real form-element interaction, so data-save-bar can't
    // reliably see those edits. Per Shopify's docs, the two approaches
    // shouldn't be mixed on one form — so we drive the bar entirely from
    // React state here instead.
    const markDirty = () => {
        if (!isDirty) {
            setIsDirty(true);
            shopify.saveBar.show(SAVE_BAR_ID);
        }
    };

    const handleNameInput = (event) => {
        setName(event.target.value);
        markDirty();
    };

    const handleStatusChange = (event) => {
        setStatus(event.target.value);
        markDirty();
    };

    const handleFieldsChange = (nextFields) => {
        setFields(nextFields);
        markDirty();
    };

    const handleSave = () => {
        const formData = new FormData();
        formData.set("intent", "update");
        formData.set("name", name);
        formData.set("status", status);
        formData.set("fields", JSON.stringify(fields));
        submit(formData, { method: "post" });
    };

    const handleDiscard = () => {
        setName(form.name);
        setStatus(form.status);
        setFields(form.fields);
        setIsDirty(false);
        shopify.saveBar.hide(SAVE_BAR_ID);
    };

    const handleDelete = () => {
        const formData = new FormData();
        formData.set("intent", "delete");
        submit(formData, { method: "post" });
    };

    return (
        <s-page heading={form.name}>
            <s-link slot="breadcrumb-actions" href="/app/forms">
                Forms
            </s-link>
            <s-button
                type="button"
                variant="secondary"
                tone="critical"
                slot="secondary-actions"
                commandFor="delete-form-modal"
                command="--show"
            >
                Delete Form
            </s-button>

            <ui-save-bar id={SAVE_BAR_ID} discardConfirmation>
                <button variant="primary" onClick={handleSave} disabled={isSaving}>
                    Save
                </button>
                <button onClick={handleDiscard} disabled={isSaving}>
                    Discard
                </button>
            </ui-save-bar>

            <s-section>
                <s-stack direction="block" gap="small">
                    <div
                        style={{
                            display: "grid",
                            gap: "10px",
                            gridTemplateColumns: "repeat(2, 1fr)",
                        }}
                    >
                        <s-text-field
                            required
                            autocomplete="off"
                            label="Form Name"
                            placeholder="e.g. Sales Inquiry"
                            value={name}
                            error={actionData?.errors?.name}
                            onInput={handleNameInput}
                        ></s-text-field>
                        <s-select label="Status" value={status} onChange={handleStatusChange}>
                            <s-option value="active">Active</s-option>
                            <s-option value="inactive">Inactive</s-option>
                        </s-select>
                    </div>

                    <FormFieldsEditor
                        fields={fields}
                        onChange={handleFieldsChange}
                        fieldsError={actionData?.errors?.fields}
                    />
                </s-stack>
            </s-section>

            <s-modal id="delete-form-modal" heading="Delete form">
                <s-text>
                    Are you sure you want to delete
                    <br />
                    <s-text type="strong" tone="warning">
                        {name}
                    </s-text>
                    ? This cannot be undone.
                </s-text>

                <s-button slot="secondary-actions" commandFor="delete-form-modal" command="--hide">
                    Cancel
                </s-button>
                <s-button
                    slot="primary-action"
                    variant="primary"
                    tone="critical"
                    commandFor="delete-form-modal"
                    command="--hide"
                    onClick={handleDelete}
                >
                    Delete form
                </s-button>
            </s-modal>
        </s-page>
    );
}

export const headers = (headersArgs) => {
    return boundary.headers(headersArgs);
};