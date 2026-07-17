import { Outlet } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import Navbar from "app/components/navbar";

export const loader = async ({ request }) => {
    const { redirect } = await authenticate.admin(request);

    const url = new URL(request.url);

    if (url.pathname === "/app/settings" || url.pathname === "/app/settings/") {
        return redirect("/app/settings/ai-persona");
    }

    return null;
};

export const action = async ({ request }) => {
    const { admin } = await authenticate.admin(request);
    return null;
};

export default function Index() {
    return (
        <s-page heading="Settings">
            <s-grid gridTemplateColumns="1fr 2fr" gap="base">
                <s-grid-item>
                    <Navbar />
                </s-grid-item>
                <s-grid-item>
                    <Outlet />
                </s-grid-item>
            </s-grid>
        </s-page>
    );
}

export const headers = (headersArgs) => {
    return boundary.headers(headersArgs);
};
