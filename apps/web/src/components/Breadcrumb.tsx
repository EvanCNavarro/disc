import Link from "next/link";

interface BreadcrumbProps {
	segments: Array<{ label: string; href?: string }>;
}

export function Breadcrumb({ segments }: BreadcrumbProps) {
	return (
		<nav
			aria-label="Breadcrumb"
			className="flex items-center text-sm text-[var(--color-text-muted)]"
		>
			{segments.map((segment, i) => (
				<span key={segment.href ?? segment.label} className="flex items-center">
					{i > 0 && (
						<span className="mx-[var(--space-xs)] text-[var(--color-text-faint)]">
							&rarr;
						</span>
					)}
					{segment.href ? (
						<Link
							href={segment.href}
							className="hover:text-[var(--color-text)] transition-colors duration-[var(--duration-fast)]"
						>
							{segment.label}
						</Link>
					) : (
						<span>{segment.label}</span>
					)}
				</span>
			))}
		</nav>
	);
}
