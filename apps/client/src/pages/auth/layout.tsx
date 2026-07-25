import { Outlet } from "@tanstack/react-router";
import { LanguageSwitcher } from "@/components/language-switcher";

export const AuthLayout = () => {
  return (
    <main className="relative min-h-screen flex items-center justify-center">
      <div className="absolute right-4 top-4">
        <LanguageSwitcher />
      </div>
      <Outlet />
    </main>
  );
};
