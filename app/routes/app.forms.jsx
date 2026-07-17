import { useCallback, useEffect, useRef, useState } from "react";
import { formatDate } from "../utils";
import {
    useFetcher,
    useLoaderData,
    useNavigate
} from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import db from "../db.server";

export const loader = async ({ request }) => {
    const { session } = await authenticate.admin(request);

    const forms = await db.form.findMany({
        where: { sessionId: session.id },
        orderBy: { position: "asc" },
    });

    return {
        forms: forms.map((form) => ({
            id: form.id,
            name: form.name,
            status: form.status,
            createdAt: form.createdAt.toISOString(),
            updatedAt: form.updatedAt.toISOString(),
        })),
    };
};

export const action = async ({ request }) => {
    const { session } = await authenticate.admin(request);
    const formData = await request.formData();
    const intent = formData.get("intent");

    if (intent === "reorder") {
        const orderedIds = JSON.parse(
            String(formData.get("orderedIds") || "[]"),
        );

        // Each updateMany is scoped to this session so a shop can never
        // reorder (or touch) another shop's forms.
        await db.$transaction(
            orderedIds.map((id, index) =>
                db.form.updateMany({
                    where: { id, sessionId: session.id },
                    data: { position: index },
                }),
            ),
        );

        return { ok: true };
    }

    if (intent === "delete") {
        const id = Number(formData.get("id"));
        await db.form.deleteMany({
            where: { id, sessionId: session.id },
        });
        return { ok: true };
    }

    return null;
};

// Native HTML5 drag-and-drop reorderable row. No external package required.
// Drag events are wired up imperatively via `addEventListener` on the row's
// DOM node (obtained through `ref`) rather than as JSX props, since the
// Polaris `s-table-row` custom element's generated types only expose a
// narrow prop set (e.g. no `style`, and no guarantee of `onDragOver`/`onDrop`).
// `ref` and `className` are both known to work against these elements.
function SortableFormRow({
    row,
    index,
    onEdit,
    onReorder,
    onRequestDelete,
}) {
    const rowRef = useRef(null);
    const [isDragging, setIsDragging] = useState(false);
    const [isDragOver, setIsDragOver] = useState(false);

    useEffect(() => {
        const node = rowRef.current;
        if (!node) return;

        const handleDragOver = (event) => {
            event.preventDefault();
            if (event.dataTransfer) {
                event.dataTransfer.dropEffect = "move";
            }
            setIsDragOver(true);
        };

        const handleDragLeave = () => {
            setIsDragOver(false);
        };

        const handleDrop = (event) => {
            event.preventDefault();
            setIsDragOver(false);

            const raw = event.dataTransfer?.getData("text/plain");
            if (!raw) return;

            const fromIndex = Number(raw);
            if (Number.isNaN(fromIndex) || fromIndex === index) return;

            onReorder(fromIndex, index);
        };

        node.addEventListener("dragover", handleDragOver);
        node.addEventListener("dragleave", handleDragLeave);
        node.addEventListener("drop", handleDrop);

        return () => {
            node.removeEventListener("dragover", handleDragOver);
            node.removeEventListener("dragleave", handleDragLeave);
            node.removeEventListener("drop", handleDrop);
        };
    }, [index, onReorder]);

    return (
        <s-table-row ref={rowRef}>
            <s-table-cell>
                <span
                    className="drag-handle"
                    draggable
                    style={{ cursor: "grab", display: "inline-flex" }}
                    onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData("text/plain", String(index));
                        setIsDragging(true);
                    }}
                    onDragEnd={() => setIsDragging(false)}
                >
                    <s-icon type="drag-handle"></s-icon>
                </span>
            </s-table-cell>
            <s-table-cell>{row.name}</s-table-cell>
            <s-table-cell>
                <s-badge tone={row.status === "active" ? "success" : "neutral"}>
                    {row.status === "active" ? "Active" : "Inactive"}
                </s-badge>
            </s-table-cell>
            <s-table-cell>{formatDate(row.createdAt)}</s-table-cell>
            <s-table-cell>{formatDate(row.updatedAt)}</s-table-cell>

            <s-table-cell>
                <s-stack direction="inline" gap="base" alignItems="center">
                    <s-button
                        variant="tertiary"
                        icon="edit"
                        accessibilityLabel={`Edit form ${row.id}`}
                        onClick={() => onEdit(row.id)}
                    ></s-button>
                    <s-button
                        variant="tertiary"
                        tone="critical"
                        icon="delete"
                        accessibilityLabel={`Delete form ${row.id}`}
                        commandFor="delete-modal"
                        command="--show"
                        onClick={() => onRequestDelete(row.id, row.name)}
                    ></s-button>
                </s-stack>
            </s-table-cell>
        </s-table-row>
    );
}

export default function Index() {
    const navigate = useNavigate();
    const { forms } = useLoaderData();

    const reorderFetcher = useFetcher();
    const deleteFetcher = useFetcher();

    const [rows, setRows] = useState(forms);
    const [deleteTarget, setDeleteTarget] = useState(null);

    // Re-sync local order whenever the loader gives us fresh data
    // (e.g. after a delete revalidates the list).
    useEffect(() => {
        setRows(forms);
    }, [forms]);

    const handleEdit = (id) => {
        navigate(`/app/edit-form/${id}`);
    };

    const handleRequestDelete = (id, name) => {
        setDeleteTarget({ id, name });
    };

    const handleConfirmDelete = () => {
        if (!deleteTarget) return;
        deleteFetcher.submit(
            { intent: "delete", id: String(deleteTarget.id) },
            { method: "post" },
        );
        setDeleteTarget(null);
    };

    const handleReorder = useCallback(
        (fromIndex, toIndex) => {
            setRows((current) => {
                if (
                    fromIndex === toIndex ||
                    fromIndex < 0 ||
                    fromIndex >= current.length ||
                    toIndex < 0 ||
                    toIndex >= current.length
                ) {
                    return current;
                }

                const updated = [...current];
                const [moved] = updated.splice(fromIndex, 1);
                updated.splice(toIndex, 0, moved);

                // Autosave immediately on drop
                reorderFetcher.submit(
                    {
                        intent: "reorder",
                        orderedIds: JSON.stringify(updated.map((row) => row.id)),
                    },
                    { method: "post" },
                );

                return updated;
            });
        },
        [reorderFetcher],
    );

    return (
        <s-page heading="Forms">
            {rows.length > 0 && (
                <s-button type="button" href="/app/create-form" variant="primary" slot="primary-action">
                    Add New Form
                </s-button>
            )}
            {rows.length > 0 ? (
                <s-section>
                    <s-table variant="auto">
                        <s-table-header-row>
                            <s-table-header></s-table-header>
                            <s-table-header>Name</s-table-header>
                            <s-table-header>Status</s-table-header>
                            <s-table-header>Created at</s-table-header>
                            <s-table-header>Updated at</s-table-header>
                            <s-table-header>Actions</s-table-header>
                        </s-table-header-row>

                        <s-table-body>
                            {rows.map((row, index) => (
                                <SortableFormRow
                                    key={row.id}
                                    row={row}
                                    index={index}
                                    onEdit={handleEdit}
                                    onReorder={handleReorder}
                                    onRequestDelete={handleRequestDelete}
                                />
                            ))}
                        </s-table-body>
                    </s-table>
                </s-section>
            ) : (
                <s-section accessibilityLabel="Empty state section">
                    <s-grid gap="base" justifyItems="center" paddingBlock="large-400">
                        <s-box maxInlineSize="200px" maxBlockSize="200px">
                            <s-image
                                aspectRatio="1/0.5"
                                src="/images/empty-forms-list.jpg"
                                alt="Empty forms list"></s-image>
                        </s-box>
                        <s-grid
                            justifyItems="center"
                            maxInlineSize="450px"
                            gap="base">
                            <s-stack alignItems="center">
                                <s-heading>No forms yet</s-heading>
                                <s-paragraph>
                                    <p className="text-center">
                                        Create your first form to start collecting responses from your customers.
                                    </p>
                                </s-paragraph>
                            </s-stack>
                            <s-button type="button" href="/app/create-form" variant="primary" accessibilityLabel="Add New Form">
                                Add New Form
                            </s-button>
                        </s-grid>
                    </s-grid>
                </s-section>
            )}

            <s-modal id="delete-modal" heading="Delete form">
                <s-text>
                    Are you sure you want to delete form
                    <br />
                    <s-text type="strong" tone="warning">
                        {deleteTarget?.name ?? ""}
                    </s-text>
                    ?
                </s-text>

                <s-button slot="secondary-actions" commandFor="delete-modal" command="--hide">
                    Cancel
                </s-button>
                <s-button
                    slot="primary-action"
                    variant="primary"
                    tone="critical"
                    id="confirm-delete"
                    commandFor="delete-modal"
                    command="--hide"
                    onClick={handleConfirmDelete}
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