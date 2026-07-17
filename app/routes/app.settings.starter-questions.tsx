import type {
    ActionFunctionArgs,
    HeadersFunction,
    LoaderFunctionArgs,
} from "react-router";
import { useLoaderData, useActionData, useSubmit, useNavigation } from "react-router";
import { useState, useEffect } from "react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import db from "../db.server";

const MAX_QUESTIONS = 4;
const MAX_QUESTION_LENGTH = 100;

export const loader = async ({ request }: LoaderFunctionArgs) => {
    const { session } = await authenticate.admin(request);

    return db.starterquestion.findMany({
        where: { sessionId: session.id },
        orderBy: { position: "asc" },
    });
};

export const action = async ({ request }: ActionFunctionArgs) => {
    const { session } = await authenticate.admin(request);

    const formData = await request.formData();
    const raw = formData.get("questions") as string;


    console.log("Wokerd after form data");


    let questions: unknown;
    try {
        questions = JSON.parse(raw);
    } catch {
        return { error: "Invalid submission." };
    }

    if (!Array.isArray(questions)) {
        return { error: "Invalid submission." };
    }

    const cleaned = questions
        .map((q) => (typeof q === "string" ? q.trim() : ""))
        .filter((q) => q.length > 0);

    if (cleaned.length > 4) {
        return { error: `You can only add up to ${4} starter questions.` };
    }

    if (cleaned.some((q) => q.length > 100)) {
        return { error: `Each starter question must be ${100} characters or fewer.` };
    }

    // Replace wholesale — simplest way to keep `position` in sync with on-screen order.
    await db.$transaction([
        db.starterquestion.deleteMany({ where: { sessionId: session.id } }),
        db.starterquestion.createMany({
            data: cleaned.map((question, index) => ({
                sessionId: session.id,
                question,
                position: index,
            })),
        }),
    ]);

    console.log("Wokerd after DB PUSH ");


    return { success: true };
};

export default function StarterQuestions() {
    const questions = useLoaderData<typeof loader>();
    const actionData = useActionData<typeof action>();
    const navigation = useNavigation();
    const submit = useSubmit();

    const initial = questions.length ? questions.map((q: any) => q.question) : [""];

    const [initialFormState, setInitialFormState] = useState<string[]>(initial);
    const [formState, setFormState] = useState<string[]>(initial);

    const isSaving = navigation.state === "submitting";
    const isDirty = JSON.stringify(formState) !== JSON.stringify(initialFormState);

    function handleSave(e: React.FormEvent) {
        e.preventDefault();
        submit(
            { questions: JSON.stringify(formState.filter((q) => q.trim().length > 0)) },
            { method: "post" }
        );
    }

    function handleReset() {
        setFormState(initialFormState);
    }

    function updateQuestion(index: number, value: string) {
        const next = [...formState];
        next[index] = value;
        setFormState(next);
    }

    function removeQuestion(index: number) {
        setFormState(formState.filter((_, i) => i !== index));
    }

    function addQuestion() {
        if (formState.length >= MAX_QUESTIONS) return;
        setFormState([...formState, ""]);
    }

    useEffect(() => {
        const saveBar = document.getElementById("starter-questions-save-bar") as any;
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
            <ui-save-bar id="starter-questions-save-bar">
                <button variant="primary" disabled={isSaving} loading={isSaving ? "" : false} type="submit"></button>
                <button disabled={isSaving} onClick={handleReset} type="button"></button>
            </ui-save-bar>

            <s-section heading="Starter Questions (Quick Prompts)">
                <s-stack direction="block" gap="small">
                    {formState.map((question, index) => (
                        <s-stack direction="block" gap="small" key={index}>
                            <s-stack direction="inline" gap="small" alignItems="center">
                                <div style={{ display: "flex", gap: "10px", alignItems: "end", width: "100%" }}>
                                    <div style={{ width: "100%" }}>
                                        <s-text-field
                                            autocomplete="off"
                                            label={`Question ${index + 1}`}
                                            placeholder="Where is my order?"
                                            maxLength={MAX_QUESTION_LENGTH}
                                            value={question}
                                            onInput={(e: any) => updateQuestion(index, e.currentTarget.value)}
                                        ></s-text-field>
                                    </div>
                                    <div style={{ marginBottom: "3px" }}>
                                        <s-button
                                            type="button"
                                            icon="delete"
                                            variant="primary"
                                            tone="critical"
                                            onClick={() => removeQuestion(index)}
                                        ></s-button>
                                    </div>
                                </div>
                            </s-stack>
                        </s-stack>
                    ))}
                    <s-button
                        variant="secondary"
                        icon="plus"
                        type="button"
                        tone="neutral"
                        disabled={formState.length >= MAX_QUESTIONS}
                        onClick={addQuestion}
                    >
                        Add Starter Question
                    </s-button>
                    <s-text color="subdued">Maximum of {MAX_QUESTIONS} starter questions.</s-text>
                </s-stack>
            </s-section>
        </form>
    );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);