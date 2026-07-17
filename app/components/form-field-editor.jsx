import { useState } from "react";

const FIELD_TYPE_LABELS = {
    text: "Text",
    email: "Email",
    phone: "Phone",
    number: "Number",
    dropdown: "Dropdown",
    checkbox: "Checkbox",
};

function createEmptyDraft() {
    return {
        label: "",
        type: "text",
        placeholder: "",
        optionsText: "",
        required: false,
    };
}

function generateId() {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
        return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Reusable field-list editor for a Form. Fully controlled — the parent
 * (create-form / edit-form) owns the `fields` array in state and this
 * component only ever calls `onChange` with the next array.
 *
 * NOTE: s-text-field fires a native `input` event on every keystroke and
 * only fires `change` on blur/commit. React's `onInput` prop is wired to
 * the former, `onChange` to the latter — text fields here use `onInput`
 * so state (and therefore validation/disabled state) updates immediately
 * as the user types, rather than only after they click away. s-select /
 * s-checkbox commit their value immediately on interaction, so `onChange`
 * is fine for those. Adjust if your Polaris web component build fires a
 * differently-shaped event.
 */
export function FormFieldsEditor({
    fields,
    onChange,
    modalId = "add-field-modal",
    showHeaderAddButton = true,
    fieldsError,
}) {
    const [draft, setDraft] = useState(createEmptyDraft());
    const [draftErrors, setDraftErrors] = useState({});

    const resetDraft = () => {
        setDraft(createEmptyDraft());
        setDraftErrors({});
    };

    const isDraftValid =
        draft.label.trim().length > 0 &&
        (draft.type !== "dropdown" || draft.optionsText.trim().length > 0);

    const handleAddField = () => {
        const nextErrors = {};
        if (draft.label.trim().length === 0) {
            nextErrors.label = "Field label is required.";
        }
        if (draft.type === "dropdown" && draft.optionsText.trim().length === 0) {
            nextErrors.optionsText = "Add at least one option for a dropdown field.";
        }

        if (Object.keys(nextErrors).length > 0) {
            setDraftErrors(nextErrors);
            return;
        }

        const newField = {
            id: generateId(),
            label: draft.label.trim(),
            type: draft.type,
            placeholder: draft.placeholder.trim(),
            options:
                draft.type === "dropdown"
                    ? draft.optionsText
                        .split(",")
                        .map((option) => option.trim())
                        .filter(Boolean)
                    : [],
            required: draft.required,
        };

        onChange([...fields, newField]);
        resetDraft();
    };

    const handleDeleteField = (id) => {
        onChange(fields.filter((field) => field.id !== id));
    };

    const handleMoveField = (index, direction) => {
        const targetIndex = index + direction;
        if (targetIndex < 0 || targetIndex >= fields.length) return;

        const updated = [...fields];
        const [moved] = updated.splice(index, 1);
        updated.splice(targetIndex, 0, moved);
        onChange(updated);
    };

    return (
        <s-stack direction="block" gap="small">
            <s-stack direction="inline" justifyContent="space-between" alignItems="center">
                <s-heading>Form Fields</s-heading>
                {showHeaderAddButton && (
                    <s-button type="button" variant="secondary" commandFor={modalId} command="--show">
                        Add Field
                    </s-button>
                )}
            </s-stack>

            {fieldsError ? <s-text tone="critical">{fieldsError}</s-text> : null}

            {fields.length === 0 ? (
                <s-text color="subdued">No fields yet. Click "Add Field" to get started.</s-text>
            ) : (
                <div
                    style={{
                        display: "grid",
                        gap: "10px",
                        gridTemplateColumns: "repeat(2, 1fr)",
                    }}
                >
                    {fields.map((field, index) => (
                        <s-box key={field.id} background="subdued" padding="small" borderRadius="base">
                            <s-stack direction="inline" justifyContent="space-between" alignItems="center">
                                <s-stack direction="inline" gap="small" alignItems="center">
                                    <s-stack direction="block" justifyContent="space-between">
                                        <s-button
                                            type="button"
                                            variant="tertiary"
                                            tone="neutral"
                                            icon="chevron-up"
                                            disabled={index === 0}
                                            accessibilityLabel={`Move ${field.label} up`}
                                            onClick={() => handleMoveField(index, -1)}
                                        ></s-button>
                                        <s-button
                                            type="button"
                                            variant="tertiary"
                                            tone="neutral"
                                            icon="chevron-down"
                                            disabled={index === fields.length - 1}
                                            accessibilityLabel={`Move ${field.label} down`}
                                            onClick={() => handleMoveField(index, 1)}
                                        ></s-button>
                                    </s-stack>
                                    <s-stack direction="block" justifyContent="space-between">
                                        <s-text type="strong">{field.label}</s-text>
                                        <s-text color="subdued">
                                            {field.placeholder || "No placeholder"}
                                        </s-text>
                                    </s-stack>
                                    <s-badge tone="info">{FIELD_TYPE_LABELS[field.type]}</s-badge>
                                    {field.required ? <s-badge tone="warning">Required</s-badge> : null}
                                </s-stack>
                                <s-button
                                    type="button"
                                    variant="tertiary"
                                    tone="critical"
                                    icon="delete"
                                    accessibilityLabel={`Delete field ${field.label}`}
                                    onClick={() => handleDeleteField(field.id)}
                                ></s-button>
                            </s-stack>
                        </s-box>
                    ))}
                </div>
            )}

            <s-modal size="small" id={modalId} heading="Add New Field">
                <s-stack gap="small" direction="block">
                    <s-text-field
                        required
                        autocomplete="off"
                        label="Field Label"
                        placeholder="e.g. Full Name"
                        value={draft.label}
                        error={draftErrors.label}
                        onInput={(event) => {
                            const value = event.target.value;
                            setDraft((current) => ({ ...current, label: value }));
                            if (draftErrors.label) {
                                setDraftErrors((current) => ({ ...current, label: undefined }));
                            }
                        }}
                    ></s-text-field>

                    <s-select
                        label="Field Type"
                        value={draft.type}
                        onChange={(event) =>
                            setDraft((current) => ({
                                ...current,
                                type: event.target.value,
                            }))
                        }
                    >
                        <s-option value="text">Text</s-option>
                        <s-option value="email">Email</s-option>
                        <s-option value="phone">Phone</s-option>
                        <s-option value="number">Number</s-option>
                        <s-option value="dropdown">Dropdown</s-option>
                        <s-option value="checkbox">Checkbox</s-option>
                    </s-select>

                    <s-text-field
                        autocomplete="off"
                        label="Placeholder"
                        placeholder="e.g. Enter your name"
                        value={draft.placeholder}
                        onInput={(event) =>
                            setDraft((current) => ({ ...current, placeholder: event.target.value }))
                        }
                    ></s-text-field>

                    {/* Only shown for dropdown fields, per requirement */}
                    {draft.type === "dropdown" ? (
                        <s-text-field
                            required
                            autocomplete="off"
                            label="Options (comma-separated)"
                            placeholder="e.g. Option 1, Option 2"
                            value={draft.optionsText}
                            error={draftErrors.optionsText}
                            onInput={(event) => {
                                const value = event.target.value;
                                setDraft((current) => ({ ...current, optionsText: value }));
                                if (draftErrors.optionsText) {
                                    setDraftErrors((current) => ({ ...current, optionsText: undefined }));
                                }
                            }}
                        ></s-text-field>
                    ) : null}

                    <s-checkbox
                        label="Required field"
                        checked={draft.required}
                        onChange={(event) =>
                            setDraft((current) => ({ ...current, required: event.target.checked }))
                        }
                    ></s-checkbox>
                </s-stack>

                <s-button slot="secondary-actions" commandFor={modalId} command="--hide" onClick={resetDraft}>
                    Close
                </s-button>
                <s-button
                    slot="primary-action"
                    variant="primary"
                    tone="neutral"
                    commandFor={modalId}
                    command="--hide"
                    onClick={handleAddField}
                    disabled={!isDraftValid}
                >
                    Add Field
                </s-button>
            </s-modal>
        </s-stack>
    );
}