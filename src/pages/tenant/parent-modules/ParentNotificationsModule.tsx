import { useEffect, useState, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { api } from "@/lib/api";
import { ChildInfo } from "@/hooks/useMyChildren";
import { format } from "date-fns";
import { Bell, CheckCheck, Settings, WifiOff, RefreshCw } from "lucide-react";
import { NotificationPreferencesCard } from "@/components/notifications/NotificationPreferencesCard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useOfflineNotifications } from "@/hooks/useOfflineData";
import { OfflineDataBanner } from "@/components/offline/OfflineDataBanner";

interface ParentNotificationsModuleProps {
  child: ChildInfo | null;
  schoolId: string | null;
}

interface Notification {
  id: string;
  title: string;
  body: string | null;
  type: string;
  readAt: string | null;
  createdAt: string;
}

const ParentNotificationsModule = ({ child, schoolId }: ParentNotificationsModuleProps) => {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    api.auth.getUser().then(({ data }) => {
      setCurrentUserId(data.user?.id || null);
    });
  }, []);

  // Use offline-first hook
  const { 
    data: cachedNotifications, 
    loading, 
    isOffline, 
    isUsingCache,
    refresh 
  } = useOfflineNotifications(schoolId, currentUserId);

  // Convert cached data to display format
  const notifications = useMemo(() => {
    return cachedNotifications.map(n => ({
      id: n.id,
      title: n.title,
      body: n.body,
      type: n.type,
      readAt: n.readAt,
      createdAt: n.createdAt,
    })) as Notification[];
  }, [cachedNotifications]);

  const markAsRead = async (id: string) => {
    if (isOffline) return;
    
    await api
      .from("app_notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", id);
    
    refresh();
  };

  const markAllAsRead = async () => {
    if (!currentUserId || isOffline) return;

    const unreadIds = notifications.filter(n => !n.readAt).map(n => n.id);
    if (unreadIds.length === 0) return;

    await api
      .from("app_notifications")
      .update({ read_at: new Date().toISOString() })
      .in("id", unreadIds);

    refresh();
  };

  const typeColor = (type: string) => {
    switch (type) {
      case "alert":
        return "destructive";
      case "warning":
        return "secondary";
      default:
        return "outline";
    }
  };

  if (!child) {
    return (
      <div className="text-center text-muted-foreground py-12">
        Please select a child to view notifications.
      </div>
    );
  }

  const unreadCount = notifications.filter((n) => !n.readAt).length;

  if (loading && !isUsingCache) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <OfflineDataBanner isOffline={isOffline} isUsingCache={isUsingCache} onRefresh={refresh} />
      
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Notifications</h1>
          <p className="text-muted-foreground">
            Alerts and updates for {child.first_name || "your child"}
          </p>
        </div>
        <div className="flex gap-2">
          {!isOffline && (
            <Button variant="outline" size="sm" onClick={refresh}>
              <RefreshCw className="h-4 w-4 mr-1" />
              Refresh
            </Button>
          )}
          {unreadCount > 0 && !isOffline && (
            <Button variant="outline" size="sm" onClick={markAllAsRead}>
              <CheckCheck className="mr-2 h-4 w-4" /> Mark all read
            </Button>
          )}
        </div>
      </div>

      <Tabs defaultValue="notifications" className="space-y-4">
        <TabsList>
          <TabsTrigger value="notifications" className="gap-2">
            <Bell className="h-4 w-4" />
            Notifications
            {unreadCount > 0 && (
              <Badge variant="secondary" className="ml-1">{unreadCount}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="preferences" className="gap-2">
            <Settings className="h-4 w-4" />
            Preferences
          </TabsTrigger>
        </TabsList>

        <TabsContent value="notifications">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5" />
                All Notifications
                {unreadCount > 0 && (
                  <Badge variant="secondary">{unreadCount} unread</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {notifications.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">
                  {isOffline ? (
                    <div className="flex flex-col items-center gap-2">
                      <WifiOff className="h-6 w-6" />
                      <span>No cached notifications available</span>
                    </div>
                  ) : (
                    "No notifications yet."
                  )}
                </div>
              ) : (
                <ScrollArea className="h-96">
                  <div className="space-y-3">
                    {notifications.map((notification) => (
                      <div
                        key={notification.id}
                        className={`rounded-lg border p-4 transition-colors ${
                          notification.readAt ? "bg-background" : "bg-accent/50"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <p className="font-medium">{notification.title}</p>
                              <Badge variant={typeColor(notification.type)}>
                                {notification.type.replace("_", " ")}
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                              {notification.body}
                            </p>
                            <p className="text-xs text-muted-foreground mt-2">
                              {format(new Date(notification.createdAt), "MMMM d, yyyy h:mm a")}
                            </p>
                          </div>
                          {!notification.readAt && !isOffline && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => markAsRead(notification.id)}
                            >
                              Mark read
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="preferences">
          {schoolId && <NotificationPreferencesCard schoolId={schoolId} />}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ParentNotificationsModule;
