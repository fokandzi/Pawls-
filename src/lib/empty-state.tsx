import { Link } from "@tanstack/react-router";
import { AppIcon, type AppIconName } from "./app-icon";
interface EmptyStateProps { emoji?: string; icon?: AppIconName; title: string; description: string; action?: { label: string; to: string }; }
export function EmptyState({ icon = "empty-no-matches", title, description, action }: EmptyStateProps) {
  return <div className="flex flex-col items-center justify-center py-20 text-center"><AppIcon name={icon} size={72} /><h2 className="mt-4 text-2xl font-bold text-gray-900">{title}</h2><p className="mt-2 max-w-md text-gray-500">{description}</p>{action && <Link to={action.to} className="mt-6 inline-flex items-center gap-2 rounded-full bg-[var(--pawls-terracotta-500)] px-6 py-3 text-sm font-semibold text-white shadow-lg transition-colors hover:bg-[var(--pawls-terracotta-600)]">{action.label}</Link>}</div>;
}
