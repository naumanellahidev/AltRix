import { Component, ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle } from "lucide-react";

interface Props {
  children: ReactNode;
  label?: string;
}

interface State {
  hasError: boolean;
  message?: string;
}

export class AISafeBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error) {
    console.error("[AISafeBoundary]", this.props.label, error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <Card className="shadow-sm border-dashed border-amber-500/40">
          <CardContent className="py-10 text-center">
            <AlertTriangle className="mx-auto h-10 w-10 text-amber-500/70" />
            <h3 className="mt-3 font-display font-semibold">
              We couldn't display this AI section
            </h3>
            <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
              The AI returned data in an unexpected format. Try regenerating the profile —
              the rest of the dashboard is still available.
            </p>
          </CardContent>
        </Card>
      );
    }
    return this.props.children;
  }
}
