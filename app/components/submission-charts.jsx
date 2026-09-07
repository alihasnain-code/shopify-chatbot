import { useEffect, useRef } from "react";
import Chart from "chart.js/auto";

export function SubmissionsTrendChart({ labels, values }) {
    const canvasRef = useRef(null);
    const chartRef = useRef(null);

    useEffect(() => {
        if (!canvasRef.current) return;

        chartRef.current = new Chart(canvasRef.current, {
            type: "line",
            data: {
                labels,
                datasets: [
                    {
                        label: "Submissions",
                        data: values,
                        borderColor: "#008060",
                        backgroundColor: "rgba(0,128,96,0.08)",
                        tension: 0.35,
                        fill: true,
                        pointRadius: 3,
                    },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
            },
        });

        return () => chartRef.current?.destroy();
    }, [labels, values]);

    return (
        <div style={{ height: 260 }}>
            <canvas ref={canvasRef}></canvas>
        </div>
    );
}

export function FormComparisonChart({ labels, values }) {
    const canvasRef = useRef(null);
    const chartRef = useRef(null);

    useEffect(() => {
        if (!canvasRef.current) return;

        chartRef.current = new Chart(canvasRef.current, {
            type: "bar",
            data: {
                labels,
                datasets: [
                    {
                        label: "Responses",
                        data: values,
                        backgroundColor: "#5c6ac4",
                        borderRadius: 6,
                    },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
            },
        });

        return () => chartRef.current?.destroy();
    }, [labels, values]);

    return (
        <div style={{ height: 260 }}>
            <canvas ref={canvasRef}></canvas>
        </div>
    );
}