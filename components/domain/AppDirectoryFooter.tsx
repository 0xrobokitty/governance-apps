import { IconLinkOut } from "@/components/icons/IconLinkOut";
import { LogoGithub } from "@/components/icons/LogoGithub";

export type AppDirectoryGroup = {
  title: string;
  links: { href: string; label: string; description: string; current: boolean }[];
};

type AppDirectoryFooterProps = {
  title: string;
  description: string;
  navigationLabel: string;
  currentApp: string;
  sourceLabel: string;
  sourceHref: string;
  sourceNote: string;
  groups: AppDirectoryGroup[];
};

const linkClass = "rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-text-primary focus-visible:ring-offset-2 focus-visible:ring-offset-app";

export function AppDirectoryFooter({ title, description, navigationLabel, currentApp, sourceLabel, sourceHref, sourceNote, groups }: AppDirectoryFooterProps) {
  return (
    <footer className="border-t border-border" data-testid="governance-app-footer">
      <div className="container mx-auto px-4 pb-6 pt-10 md:px-6 md:pt-12">
        <div className="grid gap-9 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,2fr)] lg:gap-16">
          <div className="max-w-xs">
            <h2 className="text-balance text-xl font-semibold">{title}</h2>
            <p className="mt-3 text-pretty text-sm leading-6 text-text-secondary">{description}</p>
          </div>
          <nav aria-label={navigationLabel} className="grid grid-cols-2 gap-x-6 gap-y-7 sm:grid-cols-3 sm:gap-x-8">
            {groups.map((group) => (
              <div key={group.title}>
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-secondary">{group.title}</h3>
                <ul className="space-y-2">
                  {group.links.map((link) => (
                    <li key={link.href}>
                      <a href={link.href} aria-current={link.current ? "location" : undefined} className={`group flex min-h-10 flex-col justify-center py-1 text-sm ${linkClass}`}>
                        <span className="flex items-center gap-2 font-medium transition-colors group-hover:text-yearn-blue dark:group-hover:text-blue-300 motion-reduce:transition-none">
                          {link.label}
                          {link.current ? <span className="size-1.5 shrink-0 rounded-full bg-text-tertiary" role="img" aria-label={currentApp} /> : null}
                        </span>
                        <span className="mt-0.5 text-pretty text-xs leading-5 text-text-secondary">{link.description}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>
        <div className="mt-9 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-border pt-4 text-xs text-text-secondary">
          <p>{sourceNote}</p>
          <a href={sourceHref} target="_blank" rel="noopener noreferrer" className={`inline-flex min-h-10 items-center gap-2 transition-colors hover:text-text-primary motion-reduce:transition-none ${linkClass}`}>
            <LogoGithub className="size-4" aria-hidden />
            <span>{sourceLabel}</span>
            <IconLinkOut className="size-3" aria-hidden />
          </a>
        </div>
      </div>
    </footer>
  );
}
