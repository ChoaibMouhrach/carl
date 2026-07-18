import { getRouteApi } from "@tanstack/react-router";
import { SelectPlan } from "./select-plan";
import { Header } from "./header";

const route = getRouteApi("/user/select-plan");

export const SelectPlanPage = () => {
  const { user } = route.useRouteContext();

  return (
    <div className="bg-background text-foreground min-h-screen">
      <Header email={user.email} />
      <main className="mx-auto flex max-w-6xl flex-col items-center gap-8 px-6 py-16">
        <div className="text-center">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Choose a plan to get started
          </h1>
          <p className="text-muted-foreground mt-3">
            Pick a plan to activate your account.
          </p>
        </div>
        <SelectPlan />
      </main>
    </div>
  );
};
