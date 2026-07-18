import { formatDate } from "../utils";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import {
    useLoaderData,
    useLocation,
    useNavigate,
    useSearchParams,
} from "react-router";

const PAGE_SIZE = 10;

export const loader = async ({ request, params }) => {
    const { session } = await authenticate.admin(request);

    const formId = Number(params.id);
    if (!formId || Number.isNaN(formId)) {
        throw new Response("Form not found", { status: 404 });
    }

    const form = await db.form.findFirst({
        where: { id: formId, sessionId: session.id },
        select: { id: true, name: true, fields: true },
    });

    if (!form) {
        throw new Response("Form not found", { status: 404 });
    }

    let fields = [];
    try {
        fields = JSON.parse(form.fields) || [];
    } catch (parseError) {
        console.error(`Failed to parse fields for form id=${form.id}:`, parseError);
    }

    const url = new URL(request.url);
    const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
    const skip = (page - 1) * PAGE_SIZE;

    const [totalCount, responses] = await Promise.all([
        db.form_response.count({ where: { formId } }),
        db.form_response.findMany({
            where: { formId },
            orderBy: { createdAt: "desc" },
            skip,
            take: PAGE_SIZE,
        }),
    ]);

    // Only the form's CURRENT fields become columns — a response captured
    // under an older/removed field is simply not shown for that column.
    const rows = responses.map((response) => {
        let parsedData = {};
        try {
            parsedData = JSON.parse(response.data) || {};
        } catch (parseError) {
            console.error(
                `Failed to parse data for form_response id=${response.id}:`,
                parseError
            );
        }

        const values = {};
        fields.forEach((field) => {
            const entry = parsedData[field.id];
            values[field.id] = entry ? entry.value : undefined;
        });

        return {
            id: response.id,
            values,
            createdAt: response.createdAt.toISOString(),
        };
    });

    return {
        formName: form.name,
        fields: fields
            .filter((field) => field.type !== "checkbox")
            .map((field) => ({ id: field.id, label: field.label })),
        rows,
        currentPage: page,
        totalCount,
        hasNextPage: skip + PAGE_SIZE < totalCount,
        hasPreviousPage: page > 1,
    };
};

export const action = async ({ request }) => {
    await authenticate.admin(request);

    return null;
};

function formatCellValue(value) {
    if (value === undefined || value === null || value === "") return "—";
    if (typeof value === "boolean") return value ? "Yes" : "No";
    return String(value);
}

export default function Index() {
    const {
        formName,
        fields,
        rows,
        currentPage,
        totalCount,
        hasNextPage,
        hasPreviousPage,
    } = useLoaderData();

    const [searchParams] = useSearchParams();
    const location = useLocation();
    const navigate = useNavigate();

    const goToPage = (page) => {
        const params = new URLSearchParams(searchParams);
        params.set("page", String(page));
        navigate({ pathname: location.pathname, search: params.toString() }, { replace: true });
    };

    return (
        <s-page heading={formName}>
            <s-link slot="breadcrumb-actions" href="/app/forms">
                Forms
            </s-link>

            {rows.length > 0 ? (
                <s-section>
                    <s-table
                        variant="auto"
                        paginate={totalCount > PAGE_SIZE}
                        hasNextPage={hasNextPage}
                        hasPreviousPage={hasPreviousPage}
                        onNextPage={() => goToPage(currentPage + 1)}
                        onPreviousPage={() => goToPage(currentPage - 1)}
                    >
                        <s-table-header-row>
                            {fields.map((field) => (
                                <s-table-header key={field.id}>{field.label}</s-table-header>
                            ))}
                            <s-table-header>Submitted At</s-table-header>
                        </s-table-header-row>

                        <s-table-body>
                            {rows.map((row) => (
                                <s-table-row key={row.id}>
                                    {fields.map((field) => (
                                        <s-table-cell key={field.id}>
                                            {formatCellValue(row.values[field.id])}
                                        </s-table-cell>
                                    ))}
                                    <s-table-cell>{formatDate(row.createdAt)}</s-table-cell>
                                </s-table-row>
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
                        <s-grid justifyItems="center" maxInlineSize="450px" gap="base">
                            <s-stack alignItems="center">
                                <s-heading>No submissions yet</s-heading>
                                <s-paragraph>
                                    <p className="text-center">
                                        Once visitors submit this form, their responses will appear here.
                                    </p>
                                </s-paragraph>
                            </s-stack>
                        </s-grid>
                    </s-grid>
                </s-section>
            )}
        </s-page>
    );
}

export const headers = (headersArgs) => {
    return boundary.headers(headersArgs);
};