import { useState } from "react";
import {
    redirect,
    useActionData,
    useSubmit,
    type ActionFunctionArgs,
    type HeadersFunction,
    type LoaderFunctionArgs,
} from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import db from "../db.server";
import { FormFieldsEditor, type FormFieldDef } from "../components/form-field-editor";

export const loader = async ({ request }: LoaderFunctionArgs) => {
    await authenticate.admin(request);
    return null;
};

type FormActionErrors = {
    name?: string;
    fields?: string;
};

// Checks every committed field has a label, and that dropdown fields have
// at least one non-empty option. Runs server-side as the source of truth —
// the Add Field modal also checks this client-side, but the fields array
// arrives here as raw JSON and could be tampered with or submitted without JS.
function validateFields(fields: FormFieldDef[]): string | undefined {
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

export const action = async ({ request }: ActionFunctionArgs) => {
    const { session } = await authenticate.admin(request);
    const formData = await request.formData();

    const name = String(formData.get("name") || "").trim();
    const status = String(formData.get("status") || "active");
    const fields = JSON.parse(String(formData.get("fields") || "[]")) as FormFieldDef[];

    const errors: FormActionErrors = {};

    if (!name) {
        errors.name = "Form name is required.";
    } else {
        // Form names must be unique per session (case-sensitive).
        const existing = await db.form.findFirst({
            where: { sessionId: session.id, name },
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

    const lastForm = await db.form.findFirst({
        where: { sessionId: session.id },
        orderBy: { position: "desc" },
    });

    await db.form.create({
        data: {
            sessionId: session.id,
            name,
            status,
            fields: JSON.stringify(fields),
            position: lastForm ? lastForm.position + 1 : 0,
        },
    });

    return redirect("/app/forms");
};

export default function Index() {
    const actionData = useActionData<typeof action>();
    const submit = useSubmit();

    const [name, setName] = useState("");
    const [status, setStatus] = useState("active");
    const [fields, setFields] = useState<FormFieldDef[]>([]);

    const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        const formData = new FormData(event.currentTarget);
        submit(formData, { method: "post" });
    };

    return (
        <s-page heading="Add New Form">
            <s-link slot="breadcrumb-actions" href="/app/forms">
                Forms
            </s-link>
            <s-button
                type="button"
                variant="primary"
                commandFor="add-field-modal"
                command="--show"
                slot="primary-action"
            >
                Add Field
            </s-button>

            <s-section>
                <form data-save-bar data-discard-confirmation onSubmit={handleSubmit}>
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
                                name="name"
                                value={name}
                                error={actionData?.errors?.name}
                                onInput={(event: any) => setName(event.target.value)}
                            ></s-text-field>
                            <s-select
                                label="Status"
                                name="status"
                                value={status}
                                onChange={(event: any) => setStatus(event.target.value)}
                            >
                                <s-option value="active">Active</s-option>
                                <s-option value="inactive">Inactive</s-option>
                            </s-select>
                        </div>

                        {/* Tracked by the save bar so field add/reorder/delete counts as a change */}
                        <input type="hidden" name="fields" value={JSON.stringify(fields)} readOnly />

                        <FormFieldsEditor
                            fields={fields}
                            onChange={setFields}
                            showHeaderAddButton={false}
                            fieldsError={actionData?.errors?.fields}
                        />
                    </s-stack>
                </form>
            </s-section>
        </s-page>
    );
}

export const headers: HeadersFunction = (headersArgs) => {
    return boundary.headers(headersArgs);
};