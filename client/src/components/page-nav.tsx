import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Home, TrendingUp, GitCompare } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { SidebarTrigger } from "@/components/ui/sidebar";

interface PageNavProps {
  title?: string;
  showSidebarToggle?: boolean;
}

export function PageNav({ title, showSidebarToggle = false }: PageNavProps) {
  const [location] = useLocation();

  return (
    <header className="flex items-center justify-between px-6 py-4 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
      <div className="flex items-center gap-4">
        {showSidebarToggle && <SidebarTrigger data-testid="button-sidebar-toggle" />}
        
        <div className="flex gap-2">
          <Button
            variant={location === "/" ? "default" : "outline"}
            size="sm"
            asChild
            data-testid="link-dashboard"
          >
            <Link href="/">
              <Home className="h-4 w-4 mr-2" />
              Sub-ID Tracker
            </Link>
          </Button>
          
          <Button
            variant={location === "/brand-rankings" ? "default" : "outline"}
            size="sm"
            asChild
            data-testid="link-brand-rankings"
          >
            <Link href="/brand-rankings">
              <TrendingUp className="h-4 w-4 mr-2" />
              Brand Rankings
            </Link>
          </Button>
          
          <Button
            variant={location === "/task-reconciliation" ? "default" : "outline"}
            size="sm"
            asChild
            data-testid="link-task-reconciliation"
          >
            <Link href="/task-reconciliation">
              <GitCompare className="h-4 w-4 mr-2" />
              Task Reconciliation
            </Link>
          </Button>
        </div>

        {title && (
          <div className="hidden md:block border-l pl-4 ml-2">
            <span className="text-sm font-medium text-muted-foreground">{title}</span>
          </div>
        )}
      </div>
      
      <ThemeToggle />
    </header>
  );
}
