/**
 * What next year's salary bill looks like before it is committed.
 *
 * The figures are a projection from the staff and pay records the school
 * already holds; nothing here changes anyone's pay.
 */
import { Coins } from "lucide-react";

import { ModuleHeader } from "@/components/tenant/module-kit";
import { SalaryBudgetForecast } from "@/components/accountant/SalaryBudgetForecast";

export default function BudgetSimulatorPage() {
  return (
    <div className="space-y-5">
      <ModuleHeader
        icon={Coins}
        tone="amber"
        title="Budget Simulator"
        description="Project next year's salary bill from the staff you have, and see how a raise, a hire or a change of grade moves it. Nothing here changes anyone's pay."
      />
      <SalaryBudgetForecast />
    </div>
  );
}
