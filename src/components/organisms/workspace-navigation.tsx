import Link from "next/link";
import { LayoutDashboard, Settings2, Layers3 } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
export function WorkspaceNavigation({ pathname }: { pathname: string }) {
  return (
    <aside className="border-b bg-sidebar p-4 md:fixed md:inset-y-0 md:left-0 md:w-56 md:border-r md:border-b-0 md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-4 md:h-full md:flex-col md:items-stretch md:justify-start">
        <Link
          href="/"
          className="flex items-center gap-3 font-semibold tracking-tight"
        >
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Layers3 className="size-5" aria-hidden="true" />
          </span>
          <span className="text-lg">Harness</span>
          <Badge variant="outline" className="text-[9px] tracking-widest">
            LOCAL
          </Badge>
        </Link>
        <div className="md:mt-9">
          <p className="mb-3 hidden px-3 text-[10px] font-semibold tracking-[0.2em] text-muted-foreground md:block">
            WORKSPACE
          </p>
          <nav aria-label="Workspace" className="flex gap-1 md:flex-col">
            {[
              { href: "/", label: "Tổng quan", icon: LayoutDashboard },
              { href: "/settings", label: "Model & skills", icon: Settings2 },
            ].map(({ href, label, icon: Icon }) => {
              const active = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    buttonVariants({ variant: "ghost" }),
                    "justify-start px-3 text-xs md:text-sm",
                    active
                      ? "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary"
                      : "text-muted-foreground",
                  )}
                >
                  <Icon aria-hidden="true" />
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="mt-auto hidden md:block">
          <Separator />
          <p className="mt-4 text-xs text-muted-foreground">
            Agent workspace · Local
          </p>
        </div>
      </div>
    </aside>
  );
}
