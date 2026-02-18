"use client";

import { useMemo } from "react";
import {
	CartesianGrid,
	ResponsiveContainer,
	Scatter,
	ScatterChart,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";

const STATUS_COLORS: Record<string, string> = {
	success: "var(--color-accent)",
	no_work: "var(--color-text-muted)",
	failure: "var(--color-destructive)",
	skipped: "var(--color-border)",
};

interface TimelinePoint {
	minuteOfDay: number;
	tickType: string;
	status: string;
	durationMs: number | null;
	playlistsProcessed: number | null;
	tokenRefreshed: boolean;
	errorMessage: string | null;
	startedAt: string;
}

interface ChartPoint extends TimelinePoint {
	y: number;
}

function TickMark(props: { cx?: number; cy?: number; payload?: ChartPoint }) {
	const { cx, cy, payload } = props;
	if (cx == null || cy == null || !payload) return null;

	const color = STATUS_COLORS[payload.status] ?? STATUS_COLORS.skipped;
	return (
		<line
			x1={cx}
			y1={cy - 14}
			x2={cx}
			y2={cy + 14}
			stroke={color}
			strokeWidth={2}
			strokeLinecap="round"
			opacity={0.85}
		/>
	);
}

const TYPE_LABELS: Record<string, string> = {
	watcher: "Watcher",
	cron: "Scheduled Cron",
	heartbeat: "Heartbeat",
	manual: "Manual",
	auto: "Auto-detect",
};

function TimelineTooltip({
	active,
	payload,
}: {
	active?: boolean;
	payload?: Array<{ payload: ChartPoint }>;
}) {
	if (!active || !payload?.length) return null;
	const p = payload[0].payload;

	const time = new Date(p.startedAt).toLocaleTimeString("en-US", {
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		timeZone: "UTC",
	});

	return (
		<div className="glass rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-2 text-sm shadow-lg">
			<p className="font-medium">{time} UTC</p>
			<div className="mt-1 space-y-0.5 text-[var(--color-text-muted)]">
				<p>Type: {TYPE_LABELS[p.tickType] ?? p.tickType}</p>
				{p.durationMs != null && <p>Duration: {p.durationMs}ms</p>}
				<p>
					Status:{" "}
					<span
						style={{ color: STATUS_COLORS[p.status] }}
						className="font-medium"
					>
						{p.status}
					</span>
				</p>
				{p.playlistsProcessed != null && (
					<p>Playlists: {p.playlistsProcessed}</p>
				)}
				{p.tokenRefreshed && (
					<p className="text-xs text-[var(--color-accent)]">Token refreshed</p>
				)}
				{p.errorMessage && (
					<p className="text-xs text-[var(--color-destructive)]">
						{p.errorMessage}
					</p>
				)}
			</div>
		</div>
	);
}

export function WorkerTimeline({ data }: { data: TimelinePoint[] }) {
	const chartData = useMemo<ChartPoint[]>(
		() => data.map((d) => ({ ...d, y: 1 })),
		[data],
	);

	if (chartData.length === 0) {
		return (
			<div className="flex h-[80px] items-center justify-center text-sm text-[var(--color-text-muted)]">
				No ticks recorded for this day
			</div>
		);
	}

	return (
		<>
			<div className="w-full overflow-x-auto sm:overflow-x-visible">
				<div className="min-w-[600px] sm:min-w-0">
					<ResponsiveContainer width="100%" height={80}>
						<ScatterChart margin={{ top: 10, right: 10, bottom: 10, left: 10 }}>
							<CartesianGrid
								horizontal={false}
								strokeDasharray="3 3"
								stroke="var(--color-border)"
							/>
							<XAxis
								dataKey="minuteOfDay"
								type="number"
								domain={[0, 1440]}
								ticks={[0, 360, 720, 1080, 1440]}
								tickFormatter={(min: number) => {
									const h = Math.floor(min / 60);
									return `${h.toString().padStart(2, "0")}:00`;
								}}
								tick={{ fill: "var(--color-text-muted)", fontSize: 12 }}
								axisLine={{ stroke: "var(--color-border)" }}
								tickLine={false}
							/>
							<YAxis dataKey="y" hide domain={[0, 2]} />
							<Tooltip content={<TimelineTooltip />} cursor={false} />
							<Scatter
								data={chartData}
								shape={<TickMark />}
								isAnimationActive={false}
							/>
						</ScatterChart>
					</ResponsiveContainer>
				</div>
			</div>
			{/* Screen reader fallback */}
			<table className="sr-only">
				<caption>Worker execution timeline</caption>
				<thead>
					<tr>
						<th scope="col">Time</th>
						<th scope="col">Type</th>
						<th scope="col">Status</th>
					</tr>
				</thead>
				<tbody>
					{data.map((d) => (
						<tr key={d.startedAt}>
							<td>{d.startedAt}</td>
							<td>{d.tickType}</td>
							<td>{d.status}</td>
						</tr>
					))}
				</tbody>
			</table>
		</>
	);
}
