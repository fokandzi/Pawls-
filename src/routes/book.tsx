import { AppHeader, AppFooter } from "../lib/app-header";
import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/book")({
  component: BookLayout,
});

function BookLayout() {
  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader active="book" />
      <Outlet />
      <AppFooter />
    </div>
  );
}
