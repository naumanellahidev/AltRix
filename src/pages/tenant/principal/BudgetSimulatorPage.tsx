// src/pages/tenant/principal/BudgetSimulatorPage.tsx
import { SalaryBudgetForecast } from "@/components/accountant/SalaryBudgetForecast";

export default function BudgetSimulatorPage() {
  return (
    <section className="p-4 lg:p-6 space-y-4">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Budget Simulator</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Plan salary budgets, project annual costs, and analyze variance by role.
        </p>
      </div>
      <SalaryBudgetForecast />
    </section>
  );
}
