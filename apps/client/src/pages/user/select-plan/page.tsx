import { getRouteApi } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { SelectPlan } from "./select-plan";
import { Header } from "./header";

const route = getRouteApi("/user/select-plan");

export const SelectPlanPage = () => {
  const { user } = route.useRouteContext();
  const { t } = useTranslation();

  return (
    <div className="bg-background text-foreground min-h-screen">
      <Header email={user.email} />
      <main className="mx-auto flex max-w-6xl flex-col items-center gap-8 px-6 py-16">
        <div className="text-center">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            {t("selectPlan.title")}
          </h1>
          <p className="text-muted-foreground mt-3">
            {t("selectPlan.subtitle")}
          </p>
        </div>
        <SelectPlan />
      </main>
    </div>
  );
};
