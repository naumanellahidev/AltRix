import { UsersModule } from "@/pages/tenant/modules/UsersModule";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StaffDirectoryTab } from "@/components/hr/StaffDirectoryTab";
import { UserCog, Users2 } from "lucide-react";

export function HrUsersModule() {
  return (
    <Tabs defaultValue="accounts" className="space-y-4">
      <TabsList>
        <TabsTrigger value="accounts" className="gap-2">
          <UserCog className="h-4 w-4" /> Accounts & Roles
        </TabsTrigger>
        <TabsTrigger value="directory" className="gap-2">
          <Users2 className="h-4 w-4" /> Record-only Staff
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
