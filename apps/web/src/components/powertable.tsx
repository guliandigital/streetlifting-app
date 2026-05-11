import {
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type ReactNode,
  type SVGProps,
} from 'react';
import { cn } from '@streetlifting/ui';

const powerTableIconNames = [
  'add',
  'arrow-down',
  'arrow-left',
  'arrow-right',
  'athletes',
  'awards',
  'bar',
  'billing',
  'break',
  'certificate',
  'chart',
  'check',
  'close',
  'coach',
  'competition',
  'document',
  'files',
  'filter',
  'flag',
  'flow',
  'history',
  'home',
  'info',
  'inventory',
  'judges',
  'link',
  'list',
  'mail',
  'menu',
  'more',
  'moon',
  'music',
  'nomination',
  'notifications',
  'operator',
  'platform',
  'plates',
  'print',
  'records',
  'refresh',
  'reports',
  'save',
  'scoreboard',
  'search',
  'settings',
  'star',
  'stages',
  'sun',
  'teams',
  'telegram',
  'timer',
  'warning',
] as const;

export type PowerTableIconName = (typeof powerTableIconNames)[number];

const iconAliases: Record<string, PowerTableIconName> = {
  '8': 'platform',
  '☑': 'nomination',
  '☕': 'break',
  '⚑': 'flag',
  '⚙': 'settings',
  '⚖': 'judges',
  '⚠': 'warning',
  '✈': 'notifications',
  '✉': 'mail',
  '↺': 'history',
  '🔄': 'refresh',
  '🔎': 'search',
  '🔊': 'music',
  '🔗': 'flow',
  '🔩': 'bar',
  '🌈': 'plates',
  '🌐': 'records',
  '🎓': 'coach',
  '🎵': 'music',
  '🏅': 'certificate',
  '🏆': 'competition',
  '🏋': 'bar',
  '🏠': 'inventory',
  '👥': 'athletes',
  '💳': 'billing',
  '💾': 'save',
  '📄': 'document',
  '📊': 'chart',
  '📋': 'list',
  '📨': 'telegram',
  '📺': 'scoreboard',
  '🔀': 'stages',
  '🖨': 'print',
  '🥇': 'awards',
  '🤖': 'operator',
  '✅': 'check',
  '➕': 'add',
  '⬇': 'arrow-down',
  'Ⅱ': 'break',
  'ⓘ': 'info',
  '⌂': 'home',
  '☆': 'star',
  '×': 'close',
  '⋮': 'more',
};

function isPowerTableIconName(value: string): value is PowerTableIconName {
  return (powerTableIconNames as readonly string[]).includes(value);
}

function resolvePowerTableIcon(value: string): PowerTableIconName | null {
  if (isPowerTableIconName(value)) return value;
  return iconAliases[value] ?? null;
}

function renderIcon(icon: PowerTableIconName | ReactNode): ReactNode {
  if (typeof icon === 'string') {
    const resolved = resolvePowerTableIcon(icon);
    return resolved ? <PowerTableIcon name={resolved} /> : icon;
  }

  return icon;
}

function PowerTableIconGlyph({ name }: { name: PowerTableIconName }) {
  switch (name) {
    case 'add':
      return <path d="M12 5v14M5 12h14" />;
    case 'arrow-down':
      return <path d="M12 5v14M6.5 13.5 12 19l5.5-5.5" />;
    case 'arrow-left':
      return <path d="M15 6 9 12l6 6" />;
    case 'arrow-right':
      return <path d="m9 6 6 6-6 6" />;
    case 'athletes':
    case 'teams':
      return (
        <>
          <circle cx="9" cy="8" r="3" />
          <circle cx="16.5" cy="9.5" r="2.5" />
          <path d="M3.8 19.5c.7-3 2.6-5 5.2-5s4.5 2 5.2 5" />
          <path d="M13.5 18.8c.8-1.9 2.1-3 3.8-3 1.6 0 2.8 1 3.4 3" />
        </>
      );
    case 'awards':
      return (
        <>
          <path d="M8 21h8M12 17v4M8 4h8v5a4 4 0 0 1-8 0V4Z" />
          <path d="M8 6H5.5A2.5 2.5 0 0 0 8 10.5M16 6h2.5a2.5 2.5 0 0 1-2.5 4.5" />
        </>
      );
    case 'bar':
      return (
        <>
          <path d="M3 12h18" />
          <path d="M6 8v8M8.5 7v10M15.5 7v10M18 8v8" />
        </>
      );
    case 'billing':
      return (
        <>
          <rect x="3.5" y="6" width="17" height="12" rx="2" />
          <path d="M3.5 10h17M7 14h4M15 14h2" />
        </>
      );
    case 'break':
      return (
        <>
          <path d="M8 7v10M16 7v10" />
          <path d="M5 4h14v16H5z" />
        </>
      );
    case 'certificate':
      return (
        <>
          <path d="M6 3.5h9l3 3V20H6V3.5Z" />
          <path d="M15 3.5V7h3M9 10h6M9 13h3" />
          <path d="m15.2 15.5 1.1 1.8 1.1-1.8M16.3 14.2v4.8" />
        </>
      );
    case 'chart':
      return (
        <>
          <path d="M4 19h16" />
          <path d="M7 16v-5M12 16V7M17 16v-8" />
        </>
      );
    case 'check':
      return (
        <>
          <rect x="4" y="4" width="16" height="16" rx="3" />
          <path d="m8 12.3 2.7 2.7L16.5 9" />
        </>
      );
    case 'close':
      return <path d="m7 7 10 10M17 7 7 17" />;
    case 'coach':
      return (
        <>
          <path d="M7 8h10l2 3-2 3H7l-2-3 2-3Z" />
          <path d="M9 11h6M12 14v5" />
        </>
      );
    case 'competition':
      return (
        <>
          <path d="M5 19h14" />
          <path d="M8 16h8l1-10H7l1 10Z" />
          <path d="M7 8H4.5A3.5 3.5 0 0 0 8 12M17 8h2.5A3.5 3.5 0 0 1 16 12" />
        </>
      );
    case 'document':
    case 'files':
      return (
        <>
          <path d="M6 3.5h8l4 4V20H6V3.5Z" />
          <path d="M14 3.5V8h4M9 12h6M9 15h5" />
        </>
      );
    case 'filter':
      return <path d="M4 6h16l-6.3 7.1V19l-3.4 1.5v-7.4L4 6Z" />;
    case 'flag':
      return (
        <>
          <path d="M6 20V4" />
          <path d="M6 5h10.5l-1.5 4 1.5 4H6" />
        </>
      );
    case 'flow':
      return (
        <>
          <circle cx="6" cy="7" r="2.5" />
          <circle cx="18" cy="7" r="2.5" />
          <circle cx="12" cy="18" r="2.5" />
          <path d="M8.5 7h7M7.3 9.2l3.4 6.6M16.7 9.2l-3.4 6.6" />
        </>
      );
    case 'history':
      return (
        <>
          <path d="M5 12a7 7 0 1 0 2-5" />
          <path d="M5 5v5h5M12 8v4l3 2" />
        </>
      );
    case 'home':
      return (
        <>
          <path d="M4 11.5 12 5l8 6.5" />
          <path d="M6.5 10.5V20h11v-9.5" />
          <path d="M10 20v-5h4v5" />
        </>
      );
    case 'info':
      return (
        <>
          <circle cx="12" cy="12" r="8" />
          <path d="M12 11v5M12 8h.01" />
        </>
      );
    case 'inventory':
      return (
        <>
          <path d="M4 8.5 12 4l8 4.5v7L12 20l-8-4.5v-7Z" />
          <path d="m4 8.5 8 4.5 8-4.5M12 13v7" />
        </>
      );
    case 'judges':
      return (
        <>
          <path d="M12 4v16M7 7h10M6 7l-3 6h6L6 7ZM18 7l-3 6h6l-3-6Z" />
          <path d="M9 20h6" />
        </>
      );
    case 'link':
      return (
        <>
          <path d="M9.5 14.5 14.5 9.5" />
          <path d="M10.5 6.5 12 5a4 4 0 0 1 5.7 5.7L16 12.4" />
          <path d="M13.5 17.5 12 19a4 4 0 0 1-5.7-5.7L8 11.6" />
        </>
      );
    case 'list':
      return (
        <>
          <path d="M8 7h12M8 12h12M8 17h12" />
          <path d="M4 7h.01M4 12h.01M4 17h.01" />
        </>
      );
    case 'mail':
      return (
        <>
          <rect x="3.5" y="6" width="17" height="12" rx="2" />
          <path d="m4 8 8 5 8-5" />
        </>
      );
    case 'menu':
      return <path d="M5 7h14M5 12h14M5 17h14" />;
    case 'more':
      return (
        <>
          <circle cx="12" cy="6" r="1" />
          <circle cx="12" cy="12" r="1" />
          <circle cx="12" cy="18" r="1" />
        </>
      );
    case 'moon':
      return <path d="M19 14.4A7.2 7.2 0 0 1 9.6 5 7.8 7.8 0 1 0 19 14.4Z" />;
    case 'music':
      return (
        <>
          <path d="M6 15V7l10-2v8" />
          <circle cx="6" cy="17" r="2.5" />
          <circle cx="16" cy="15" r="2.5" />
        </>
      );
    case 'nomination':
      return (
        <>
          <path d="m5 7 1.7 1.7L10 5.5M5 13l1.7 1.7L10 11.5" />
          <path d="M12 7h7M12 13h7M5 19h14" />
        </>
      );
    case 'notifications':
    case 'telegram':
      return (
        <>
          <path d="m4 11 16-7-5.5 16-3.4-6.5L4 11Z" />
          <path d="m11.1 13.5 3.8-4.2" />
        </>
      );
    case 'operator':
      return (
        <>
          <path d="M5 13v-1a7 7 0 0 1 14 0v1" />
          <path d="M5 13h3v5H5v-5ZM16 13h3v5h-3v-5Z" />
          <path d="M16 18c0 1.4-1.3 2.5-4 2.5" />
        </>
      );
    case 'platform':
      return (
        <>
          <rect x="4" y="5" width="16" height="11" rx="2" />
          <path d="M8 20h8M12 16v4M8 9h8M8 12h5" />
        </>
      );
    case 'plates':
      return (
        <>
          <circle cx="12" cy="12" r="8" />
          <circle cx="12" cy="12" r="3" />
          <path d="M12 4v3M12 17v3M4 12h3M17 12h3" />
        </>
      );
    case 'print':
    case 'reports':
      return (
        <>
          <path d="M7 8V4h10v4M7 17H5a2 2 0 0 1-2-2v-4h18v4a2 2 0 0 1-2 2h-2" />
          <path d="M7 14h10v6H7zM17 11h.01" />
        </>
      );
    case 'records':
      return (
        <>
          <circle cx="12" cy="12" r="8" />
          <circle cx="12" cy="12" r="4" />
          <path d="M12 4v3M12 17v3M4 12h3M17 12h3" />
        </>
      );
    case 'refresh':
      return (
        <>
          <path d="M18 8a7 7 0 0 0-12.1-2.5L4 7.5" />
          <path d="M4 4v3.5h3.5M6 16a7 7 0 0 0 12.1 2.5L20 16.5" />
          <path d="M20 20v-3.5h-3.5" />
        </>
      );
    case 'save':
      return (
        <>
          <path d="M5 4h12l2 2v14H5V4Z" />
          <path d="M8 4v6h8V4M8 20v-6h8v6" />
        </>
      );
    case 'scoreboard':
      return (
        <>
          <rect x="4" y="5" width="16" height="12" rx="2" />
          <path d="M8 9h3M14 9h2M8 13h8M12 17v3M8 20h8" />
        </>
      );
    case 'search':
      return (
        <>
          <circle cx="10.5" cy="10.5" r="5.5" />
          <path d="m15 15 4.5 4.5" />
        </>
      );
    case 'settings':
      return (
        <>
          <circle cx="12" cy="12" r="3.2" />
          <path d="M12 3.5v2.2M12 18.3v2.2M5.9 5.9l1.6 1.6M16.5 16.5l1.6 1.6M3.5 12h2.2M18.3 12h2.2M5.9 18.1l1.6-1.6M16.5 7.5l1.6-1.6" />
        </>
      );
    case 'star':
      return <path d="m12 4 2.3 5 5.4.6-4 3.7 1.1 5.4L12 16l-4.8 2.7 1.1-5.4-4-3.7 5.4-.6L12 4Z" />;
    case 'stages':
      return (
        <>
          <path d="M5 7h4l3 10h7" />
          <path d="M15 13l4 4-4 4M15 3l4 4-4 4M12 7h7" />
        </>
      );
    case 'sun':
      return (
        <>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 3v2M12 19v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M3 12h2M19 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" />
        </>
      );
    case 'timer':
      return (
        <>
          <circle cx="12" cy="13" r="7" />
          <path d="M12 13V9M12 13l3 2M9 3h6" />
        </>
      );
    case 'warning':
      return (
        <>
          <path d="M12 4 21 20H3L12 4Z" />
          <path d="M12 10v4M12 17h.01" />
        </>
      );
    default:
      return null;
  }
}

export function PowerTableIcon({
  name,
  className,
  title,
  ...props
}: SVGProps<SVGSVGElement> & { name: PowerTableIconName; title?: string }) {
  return (
    <svg
      className={cn('pt-icon', className)}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      aria-label={title}
      role={title ? 'img' : undefined}
      focusable="false"
      {...props}
    >
      <PowerTableIconGlyph name={name} />
    </svg>
  );
}

export function PowerTableMenuIcon({ name }: { name: PowerTableIconName }) {
  return (
    <span className="pt-menu-icon" aria-hidden="true">
      <PowerTableIcon name={name} />
    </span>
  );
}

export interface PowerTableTab {
  label: ReactNode;
  active?: boolean;
  icon?: PowerTableIconName | ReactNode;
}

export function PowerTablePage({
  title,
  subtitle,
  tabs,
  actions,
  federationBar,
  children,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  tabs?: PowerTableTab[];
  actions?: ReactNode;
  federationBar?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('pt-page', className)}>
      <div className="pt-object-header">
        <div className="pt-nav-buttons" aria-hidden="true">
          <span><PowerTableIcon name="arrow-left" /></span>
          <span><PowerTableIcon name="arrow-right" /></span>
        </div>
        <span className="pt-star" aria-hidden="true"><PowerTableIcon name="star" /></span>
        <div className="min-w-0">
          <h1>{title}</h1>
          {subtitle ? <div className="pt-subtitle">{subtitle}</div> : null}
        </div>
        <div className="pt-object-icons" aria-hidden="true">
          <span className="pt-object-icon"><PowerTableIcon name="save" /></span>
          <span className="pt-object-icon"><PowerTableIcon name="print" /></span>
          <span className="pt-object-icon"><PowerTableIcon name="search" /></span>
          <span className="pt-object-icon"><PowerTableIcon name="link" /></span>
          <span className="pt-object-icon"><PowerTableIcon name="more" /></span>
          <span className="pt-object-icon"><PowerTableIcon name="close" /></span>
        </div>
      </div>
      {actions ? <div className="pt-actions">{actions}</div> : null}
      {federationBar ? <div className="pt-red-bar">{federationBar}</div> : null}
      {tabs ? <PowerTableTabs tabs={tabs} /> : null}
      <div className="pt-workspace">{children}</div>
    </section>
  );
}

export function PowerTableTabs({ tabs }: { tabs: PowerTableTab[] }) {
  return (
    <div className="pt-tabs" role="tablist">
      {tabs.map((tab, index) => (
        <div
          key={index}
          className={cn('pt-tab', tab.active && 'is-active')}
          role="tab"
          aria-selected={tab.active ? 'true' : 'false'}
        >
          {tab.icon ? <span className="pt-tab-icon">{renderIcon(tab.icon)}</span> : null}
          <span>{tab.label}</span>
        </div>
      ))}
    </div>
  );
}

export function PowerTableButton({
  className,
  tone,
  icon,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: 'primary' | 'danger' | 'green';
  icon?: PowerTableIconName | ReactNode;
}) {
  return (
    <button className={cn('pt-button', tone && `pt-button-${tone}`, className)} {...props}>
      {icon ? <span className="pt-button-icon" aria-hidden="true">{renderIcon(icon)}</span> : null}
      {children}
    </button>
  );
}

export function PowerTablePanel({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('pt-panel', className)} {...props} />;
}

export function PowerTableSectionTitle({ children }: { children: ReactNode }) {
  return <div className="pt-section-title">{children}</div>;
}

export function PowerTableToolbar({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('pt-toolbar', className)} {...props} />;
}

export function PowerTableCheckbox({
  checked,
  label,
  disabled,
  onChange,
}: {
  checked: boolean;
  label: ReactNode;
  disabled?: boolean;
  onChange?: (checked: boolean) => void;
}) {
  return (
    <label className={cn('pt-checkline', disabled && 'is-disabled')}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange?.(event.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}
