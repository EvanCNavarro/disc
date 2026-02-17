"use client";

import {
	Bar,
	BarChart,
	CartesianGrid,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";

interface ChartDataPoint {
	date: string;
	openai_usd: number;
	replicate_usd: number;
	total_usd: number;
}

function formatDate(dateStr: string): string {
	const d = new Date(`${dateStr}T00:00:00`);
	return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function CustomTooltip({
	active,
	payload,
	label,
}: {
	active?: boolean;
	payload?: Array<{ value: number; name: string; color: string }>;
	label?: string;
}) {
	if (!active || !payload?.length || !label) return null;

	const total = payload.reduce((sum, p) => sum + p.value, 0);

	return (
		<div className="glass rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-2 text-sm shadow-lg">
			<p className="font-medium">{formatDate(label)}</p>
			{payload.map((p) => (
				<p key={p.name} className="text-[var(--color-text-muted)]">
					<span
						className="mr-1 inline-block h-2 w-2 rounded-full"
						style={{ backgroundColor: p.color }}
					/>
					{p.name}: ${p.value.toFixed(4)}
				</p>
			))}
			<p className="mt-1 border-t border-[var(--color-border)] pt-1 font-medium">
				Total: ${total.toFixed(4)}
			</p>
		</div>
	);
}

export function UsageChart({ data }: { data: ChartDataPoint[] }) {
	if (data.length === 0) {
		return (
			<div
				role="img"
				aria-label="No usage data for this period"
				className="flex h-[280px] items-center justify-center text-[var(--color-text-muted)]"
			>
				<div className="text-center">
					<svg
						className="mx-auto mb-2 h-8 w-8 opacity-40"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="1.5"
					>
						<path d="M3 3v18h18" strokeLinecap="round" strokeLinejoin="round" />
						<path
							d="M7 16l4-8 4 4 4-6"
							strokeLinecap="round"
							strokeLinejoin="round"
						/>
					</svg>
					<p>No usage data for this period</p>
				</div>
			</div>
		);
	}

	const total = data.reduce((sum, d) => sum + d.total_usd, 0);

	return (
		<>
			<div
				role="img"
				aria-label={`Usage cost chart showing $${total.toFixed(2)} total across ${data.length} days`}
			>
				<ResponsiveContainer width="100%" height={280}>
					<BarChart
						data={data}
						margin={{ top: 5, right: 5, bottom: 5, left: 5 }}
					>
						<CartesianGrid
							strokeDasharray="3 3"
							stroke="var(--color-border)"
							vertical={false}
						/>
						<XAxis
							dataKey="date"
							tickFormatter={formatDate}
							tick={{ fill: "var(--color-text-muted)", fontSize: 12 }}
							axisLine={{ stroke: "var(--color-border)" }}
							tickLine={false}
						/>
						<YAxis
							tickFormatter={(v: number) => `$${v.toFixed(2)}`}
							tick={{ fill: "var(--color-text-muted)", fontSize: 12 }}
							axisLine={false}
							tickLine={false}
							width={60}
						/>
						<Tooltip content={<CustomTooltip />} />
						<Bar
							dataKey="openai_usd"
							name="OpenAI"
							stackId="cost"
							fill="var(--color-accent)"
							radius={[0, 0, 0, 0]}
						/>
						<Bar
							dataKey="replicate_usd"
							name="Replicate"
							stackId="cost"
							fill="var(--color-warning)"
							radius={[4, 4, 0, 0]}
						/>
					</BarChart>
				</ResponsiveContainer>
			</div>

			{/* Hidden accessible table for screen readers */}
			<table className="sr-only">
				<caption>Daily usage costs</caption>
				<thead>
					<tr>
						<th scope="col">Date</th>
						<th scope="col">OpenAI Cost</th>
						<th scope="col">Replicate Cost</th>
						<th scope="col">Total</th>
					</tr>
				</thead>
				<tbody>
					{data.map((d) => (
						<tr key={d.date}>
							<td>{d.date}</td>
							<td>${d.openai_usd.toFixed(4)}</td>
							<td>${d.replicate_usd.toFixed(4)}</td>
							<td>${d.total_usd.toFixed(4)}</td>
						</tr>
					))}
				</tbody>
			</table>
		</>
	);
}
