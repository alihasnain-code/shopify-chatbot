import { useLocation } from "react-router";

export default function Navbar() {

    const location = useLocation();

    const isActive = (path) => location.pathname === path;

    return (
        <s-section id="nav-section" heading="Menu">
            <s-stack direction="inline" gap="small" alignItems="center">
                <s-clickable
                    href="/app/settings/ai-persona"
                    id="nav-dashboard"
                    padding="small-200"
                    borderRadius="large-100"
                    background={isActive("/app/settings/ai-persona") ? "strong" : "transparent"}
                >
                    <s-stack direction="inline" gap="small-200" alignItems="center">
                        <s-icon type="home" size="base" />
                        <s-text>AI Persona & Tone</s-text>
                    </s-stack>
                </s-clickable>
                <s-clickable
                    href="/app/settings/starter-questions"
                    id="nav-orders"
                    padding="small-200"
                    borderRadius="large-100"
                    background={isActive("/app/settings/starter-questions") ? "strong" : "transparent"}
                >
                    <s-stack direction="inline" gap="small-200" alignItems="center">
                        <s-icon type="question-circle" size="base" />
                        <s-text>Starter Questions</s-text>
                    </s-stack>
                </s-clickable>
                <s-clickable
                    href="/app/settings/usage"
                    id="nav-settings"
                    padding="small-200"
                    borderRadius="large-100"
                    background={isActive("/app/settings/usage") ? "strong" : "transparent"}
                >
                    <s-stack direction="inline" gap="small-200" alignItems="center">
                        <s-icon type="alert-triangle" size="base" />
                        <s-text>Usage Controls</s-text>
                    </s-stack>
                </s-clickable>
            </s-stack>
        </s-section>
    )
}