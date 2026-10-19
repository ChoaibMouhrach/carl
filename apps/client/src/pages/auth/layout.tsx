import { Outlet } from "@tanstack/react-router";

export const AuthLayout = () => {
  return (
    <main className="relative min-h-screen flex items-center justify-center">
      <Outlet />
    </main>
  );
};
