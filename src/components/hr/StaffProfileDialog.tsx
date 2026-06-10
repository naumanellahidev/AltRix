import { useState, useEffect } from "react";
import { Pencil, Phone, User, Mail, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";

type StaffProfileDialogProps = {
  userId: string;
  email: string;
  displayName: string | null;
  onUpdated?: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
};

export function StaffProfileDialog({
  userId,
  email,
  displayName: initialDisplayName,
  onUpdated,
  open: controlledOpen,
  onOpenChange,
  hideTrigger,
}: StaffProfileDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = (v: boolean) => {
    if (onOpenChange) onOpenChange(v);
    else setInternalOpen(v);
  };
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form fields
  const [name, setName] = useState(initialDisplayName ?? "");
  const [phone, setPhone] = useState("");

  // Load profile data when dialog opens
  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setLoading(true);

    (async () => {
      const { data, error } = await (supabase as any)
        .from("profiles")
        .select("display_name, phone")
        .eq("id", userId)
        .maybeSingle();

      if (cancelled) return;
      setLoading(false);

      if (error) {
        console.error("Failed to load profile:", error);
        return;
      }

      if (data) {
        setName(data.display_name ?? "");
        setPhone(data.phone ?? "");
      } else {
        // No profile exists yet, use initial values
        setName(initialDisplayName ?? "");
        setPhone("");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, userId, initialDisplayName]);

  const handleSave = async () => {
    setSaving(true);
    try {
      // Check if profile exists
      const { data: existing } = await (supabase as any)
        .from("profiles")
        .select("id")
        .eq("id", userId)
        .maybeSingle();

      if (existing) {
        // Update existing profile
        const { error } = await (supabase as any)
          .from("profiles")
          .update({
            display_name: name.trim() || null,
            phone: phone.trim() || null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", userId);

        if (error) throw error;
      } else {
        // Create new profile
        const { error } = await (supabase as any).from("profiles").insert({
          id: userId,
          display_name: name.trim() || null,
          phone: phone.trim() || null,
        });

        if (error) throw error;
      }

      toast.success("Profile updated successfully");
      setOpen(false);
      onUpdated?.();
    } catch (err) {
      console.error("Failed to save profile:", err);
      toast.error("Failed to save profile");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!hideTrigger && (
        <DialogTrigger asChild>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
            <Pencil className="h-4 w-4" />
            <span className="sr-only">Edit profile</span>
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">Staff Profile</DialogTitle>
          <DialogDescription>
            View and edit staff member details
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
                Email
              </Label>
              <Input
                id="email"
                value={email}
                disabled
                className="bg-muted"
              />
              <p className="text-xs text-muted-foreground">
                Email cannot be changed
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="name" className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                Display Name
              </Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter display name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone" className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-muted-foreground" />
                Phone Number
              </Label>
              <Input
                id="phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+1 555 123 4567"
                type="tel"
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || loading}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
