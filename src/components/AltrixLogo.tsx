import { cn } from "@/lib/utils";

interface Props {
  className?: string;
  size?: "sm" | "md" | "lg";
}

export function AltrixLogo({ className, size = "md" }: Props) {
  const sizes = {
    sm: "text-base",
    md: "text-lg",
    lg: "text-3xl",
  };
  return (
    <span
      className={cn(
        "font-display font-bold tracking-tight bg-gradient-to-r from-primary via-primary to-accent bg-clip-text text-transparent",
        sizes[size],
        className,
      )}
    >
      Alt<span className="bg-gradient-to-r from-accent to-primary bg-clip-text text-transparent">Rix</span>
    </span>
  );
}
