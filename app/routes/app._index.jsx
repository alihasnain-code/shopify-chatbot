import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  const { redirect } = await authenticate.admin(request);

  const url = new URL(request.url);
  if (url.pathname === "/app" || url.pathname === "/app/") {
    return redirect("/app/settings/ai-persona");
  }

  return null;
};

export const action = async ({ request }) => {
  await authenticate.admin(request);

  return null;
};

export default function Index() {
  return (
    <s-page heading="Dashboard">
      <s-section>

      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
