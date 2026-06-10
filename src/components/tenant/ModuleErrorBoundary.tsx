import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

type Props = {
  children: ReactNode;
  /** Friendly name shown in the fallback header */
  name?: string;
};

type State = { error: Error | null };

export class ModuleErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Surface the error to the user immediately, beyond the fallback UI
    try {
      toast.error(
        `${this.props.name ?? "Module"} crashed: ${error.message || "unknown error"}`,
      );
    } catch {
      /* noop */
    }
    // Log to console so we keep the stack for debugging
    // eslint-disable-next-line no-console
    console.error("[ModuleErrorBoundary]", this.props.name, error, info);
  }

  private handleReset = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      return (
        <Card className="shadow-elevated border-destructive/40">
          <CardHeader className="flex flex-row items-start gap-3">
            <div className="rounded-lg bg-destructive/10 p-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
            </div>
            <div className="flex-1 min-w-0">
              <CardTitle className="text-lg">
                {this.props.name ?? "This page"} couldn't load
              </CardTitle>
              <p className="mt-1 text-sm text-muted-foreground break-words">
                {this.state.error.message || "An unexpected error occurred."}
              </p>
            </div>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button onClick={this.handleReset} variant="default">
              <RefreshCw className="mr-2 h-4 w-4" /> Try again
            </Button>
            <Button onClick={() => window.location.reload()} variant="outline">
              Reload page
            </Button>
          </CardContent>
        </Card>
      );
    }
    return this.props.children;
  }
}

export default ModuleErrorBoundary;
