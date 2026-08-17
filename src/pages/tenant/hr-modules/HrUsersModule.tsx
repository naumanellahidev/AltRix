import { UsersModule } from "@/pages/tenant/modules/UsersModule";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StaffDirectoryTab } from "@/components/hr/StaffDirectoryTab";
import { UserCog, Users2 } from "lucide-react";

export function HrUsersModule() {
  return (
    <Tabs defaultValue="accounts" className="space-y-4">
      <TabsList className="grid grid-cols-2 w-full max-w-md p-1 bg-surface-elevated/60 border border-muted/30 rounded-xl">
        <TabsTrigger value="accounts" className="gap-2 text-xs sm:text-sm rounded-lg py-1.5">
          <UserCog className="h-4 w-4 shrink-0" /> Accounts & Roles
        </TabsTrigger>
        <TabsTrigger value="directory" className="gap-2 text-xs sm:text-sm rounded-lg py-1.5">
          <Users2 className="h-4 w-4 shrink-0" /> Record-only Staff
        </TabsTrigger>
      </TabsList>
      <TabsContent value="accounts" className="mt-2">
        <UsersModule />
      </TabsContent>
      <TabsContent value="directory" className="mt-2">
        <StaffDirectoryTab />
      </TabsContent>
    </Tabs>
  );
}
