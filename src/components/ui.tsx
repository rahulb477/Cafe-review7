import Link from "next/link";
import type { ReactNode } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, Info, Loader2, Search, Star } from "lucide-react";
import { cn, inr, shortDate, shortTime } from "@/lib/format";

export { cn, inr, shortDate, shortTime };

/* ---------------- Surfaces ---------------- */

export function Card({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grain rounded-[18px] border border-linen bg-paper text-bean shadow-[0_1px_2px_rgba(58,33,22,0.06),0_8px_24px_-18px_rgba(58,33,22,0.35)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-4 border-b border-linen pb-2">
      <h2 className="label-caps">{children}</h2>
      {right}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="settle mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? <p className="label-caps mb-1">{eyebrow}</p> : null}
        <h1 className="display-num text-[clamp(26px,4vw,40px)] text-espresso">{title}</h1>
        {subtitle ? <p className="mt-1 max-w-2xl text-mocha">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}

/* ---------------- Controls ---------------- */

type Variant = "primary" | "ghost" | "outline" | "danger" | "quiet";

const variantClass: Record<Variant, string> = {
  primary: "bg-espresso text-cream shadow-[0_6px_16px_-10px_rgba(58,33,22,0.9)] hover:bg-roast",
  outline: "border border-espresso/25 bg-paper text-espresso hover:border-espresso/60 hover:bg-linen/50",
  ghost: "text-espresso hover:bg-linen",
  quiet: "bg-linen text-espresso hover:bg-linen/70",
  danger: "border border-ember/30 bg-ember/8 text-ember hover:bg-ember hover:text-cream",
};

const sizeClass = (size: "sm" | "md") =>
  size === "sm" ? "min-h-9 px-3 py-1.5 text-[12px]" : "min-h-11 px-4 py-2.5 text-[13px] sm:min-h-0";

export function Button({
  children,
  variant = "primary",
  size = "md",
  className,
  type = "submit",
  disabled,
  title,
  onClick,
}: {
  children: ReactNode;
  variant?: Variant;
  size?: "sm" | "md";
  className?: string;
  type?: "button" | "submit";
  disabled?: boolean;
  title?: string;
  onClick?: () => void;
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      title={title}
      onClick={onClick}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-all duration-150 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50",
        sizeClass(size),
        variantClass[variant],
        className,
      )}
    >
      {children}
    </button>
  );
}

/** Client-side variant that also accepts an onClick handler. */
export const ClientButton = Button;

export function LinkButton({
  href,
  children,
  variant = "primary",
  size = "md",
  className,
  external,
}: {
  href: string;
  children: ReactNode;
  variant?: Variant;
  size?: "sm" | "md";
  className?: string;
  external?: boolean;
}) {
  return (
    <Link
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noreferrer" : undefined}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-all duration-150 active:translate-y-px",
        sizeClass(size),
        variantClass[variant ?? "primary"],
        className,
      )}
    >
      {children}
    </Link>
  );
}

export function Field({
  label,
  hint,
  children,
  className,
  required,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
  required?: boolean;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="label-caps mb-1.5 block">
        {label}
        {required ? <span className="text-caramel"> *</span> : null}
      </span>
      {children}
      {hint ? <span className="mt-1 block text-[11px] text-mocha">{hint}</span> : null}
    </label>
  );
}

const inputClass =
  "w-full max-w-full min-w-0 rounded-xl border border-linen bg-paper px-3.5 py-3 text-[16px] text-bean placeholder:text-mocha/60 transition-colors duration-150 hover:border-mocha/50 focus:border-caramel focus:outline-none sm:py-2.5 sm:text-[13px]";

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(inputClass, props.className)} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn(inputClass, "min-h-24 resize-y", props.className)} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cn(inputClass, "appearance-none pr-8", props.className)} />;
}

export function SearchInput({
  placeholder,
  defaultValue,
  name = "q",
}: {
  placeholder: string;
  defaultValue?: string;
  name?: string;
}) {
  return (
    <div className="relative w-full sm:max-w-xs">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-mocha" />
      <Input name={name} defaultValue={defaultValue} placeholder={placeholder} className="pl-9" />
    </div>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "green" | "gold" | "red" | "ink";
}) {
  const tones = {
    neutral: "bg-linen text-roast",
    green: "bg-stamp/12 text-stamp",
    gold: "bg-gold/15 text-[#8a5f10]",
    red: "bg-ember/10 text-ember",
    ink: "bg-espresso text-cream",
  }[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase",
        tones,
      )}
    >
      {children}
    </span>
  );
}

export function Avatar({
  name,
  src,
  size = 36,
  square,
  className,
}: {
  name: string;
  src?: string | null;
  size?: number;
  square?: boolean;
  className?: string;
}) {
  const initials = name
    .split(" ")
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={name}
      style={{ width: size, height: size }}
      className={cn("shrink-0 object-cover", square ? "rounded-xl" : "rounded-full", className)}
    />
  ) : (
    <span
      style={{ width: size, height: size, fontSize: size * 0.34 }}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-espresso/10 font-bold text-espresso",
        square && "rounded-xl",
        className,
      )}
    >
      {initials}
    </span>
  );
}

export function Stars({ value10, size = 12 }: { value10: number; size?: number }) {
  const full = Math.round(value10 / 10);
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${(value10 / 10).toFixed(1)} out of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          style={{ width: size, height: size }}
          className={i <= full ? "fill-gold text-gold" : "fill-linen text-linen"}
        />
      ))}
    </span>
  );
}

/* ---------------- States ---------------- */

export function EmptyState({
  title,
  body,
  action,
  icon,
}: {
  title: string;
  body: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="settle flex flex-col items-center justify-center gap-2 rounded-[18px] border border-dashed border-mocha/30 bg-paper/60 px-6 py-14 text-center">
      <div className="mb-1 grid size-12 place-items-center rounded-2xl bg-linen text-espresso">
        {icon ?? <Info className="size-5" />}
      </div>
      <p className="display-num text-xl text-espresso">{title}</p>
      <p className="max-w-sm text-mocha">{body}</p>
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-xl bg-linen/80", className)} />;
}

export function SkeletonRows({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-16 w-full" />
      ))}
    </div>
  );
}

export function ErrorState({ message, action }: { message: string; action?: ReactNode }) {
  return (
    <div className="settle flex items-start gap-3 rounded-[18px] border border-ember/25 bg-ember/5 p-5">
      <AlertTriangle className="mt-0.5 size-5 shrink-0 text-ember" />
      <div>
        <p className="display-num text-lg text-ember">Something went wrong</p>
        <p className="text-mocha">{message}</p>
        {action ? <div className="mt-3">{action}</div> : null}
      </div>
    </div>
  );
}

export function SubmitButton({ children, pending }: { children: ReactNode; pending?: boolean }) {
  return (
    <Button type="submit" disabled={pending}>
      {pending ? <Loader2 className="size-4 animate-spin" /> : null}
      {children}
    </Button>
  );
}

/* ---------------- Data table (desktop table / mobile cards) ---------------- */

export type Column<T> = {
  key: string;
  label: string;
  render: (row: T) => ReactNode;
  className?: string;
  hideBelow?: "sm" | "md" | "lg";
};

export function DataTable<T extends { id?: string }>({
  columns,
  rows,
  card,
  empty,
}: {
  columns: Column<T>[];
  rows: T[];
  card: (row: T) => ReactNode;
  empty?: ReactNode;
}) {
  if (!rows.length)
    return <>{empty ?? <EmptyState title="Nothing here yet" body="Records will appear as they come in." />}</>;
  const hide = { sm: "hidden sm:table-cell", md: "hidden md:table-cell", lg: "hidden lg:table-cell" };
  return (
    <>
      {/* only this container may scroll horizontally — never the page */}
      <div className="hidden w-full max-w-full overflow-x-auto md:block">
        <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-linen">
            {columns.map((c) => (
              <th key={c.key} className={cn("label-caps px-3 py-2.5", c.hideBelow && hide[c.hideBelow], c.className)}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={row.id ?? i}
              style={{ animationDelay: `${Math.min(i, 8) * 20}ms` }}
              className="settle border-b border-linen/70 transition-colors duration-150 last:border-0 hover:bg-linen/40"
            >
              {columns.map((c) => (
                <td key={c.key} className={cn("px-3 py-3 align-middle", c.hideBelow && hide[c.hideBelow], c.className)}>
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        </table>
      </div>
      <div className="space-y-2.5 md:hidden">
        {rows.map((row, i) => (
          <div key={row.id ?? i} style={{ animationDelay: `${Math.min(i, 8) * 20}ms` }} className="settle">
            <Card className="p-3.5">{card(row)}</Card>
          </div>
        ))}
      </div>
    </>
  );
}

export function Pagination({
  page,
  pages,
  basePath,
  query = {},
}: {
  page: number;
  pages: number;
  basePath: string;
  query?: Record<string, string | undefined>;
}) {
  if (pages <= 1) return null;
  const href = (p: number) => {
    const params = new URLSearchParams();
    Object.entries(query).forEach(([k, v]) => v && params.set(k, v));
    params.set("page", String(p));
    return `${basePath}?${params.toString()}`;
  };
  return (
    <nav className="mt-4 flex items-center justify-between gap-3">
      <LinkButton
        href={href(page - 1)}
        variant="outline"
        size="sm"
        className={page <= 1 ? "pointer-events-none opacity-40" : ""}
      >
        <ChevronLeft className="size-3.5" /> Prev
      </LinkButton>
      <span className="label-caps">
        Page {page} / {pages}
      </span>
      <LinkButton
        href={href(page + 1)}
        variant="outline"
        size="sm"
        className={page >= pages ? "pointer-events-none opacity-40" : ""}
      >
        Next <ChevronRight className="size-3.5" />
      </LinkButton>
    </nav>
  );
}

/* ---------------- Data display ---------------- */

export function MeterBar({
  value,
  max,
  label,
  right,
}: {
  value: number;
  max: number;
  label: string;
  right?: string;
}) {
  const pct = Math.min(100, (value / Math.max(1, max)) * 100);
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-[11px]">
        <span className="font-semibold text-espresso">{label}</span>
        <span className="text-mocha">{right ?? value}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-linen">
        <div className="h-full rounded-full bg-caramel transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** The stamp card — the product's signature object. */
export function StampCard({
  stamps,
  target,
  rewardName,
  size = 44,
}: {
  stamps: number;
  target: number;
  rewardName: string;
  size?: number;
}) {
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: target }).map((_, i) => {
          const filled = i < stamps;
          return (
            <span
              key={i}
              style={{ width: size, height: size, animationDelay: `${i * 18}ms` }}
              title={filled ? "Stamped" : "Empty slot"}
              className={cn(
                "settle grid place-items-center rounded-full border-2 border-dashed text-[9px] font-bold",
                filled ? "border-espresso bg-espresso text-cream" : "border-mocha/35 bg-paper text-mocha/50",
              )}
            >
              {filled ? "✓" : i + 1}
            </span>
          );
        })}
      </div>
      <p className="mt-3 text-[12px] text-mocha">
        <span className="font-bold text-espresso">
          {stamps}/{target}
        </span>{" "}
        stamps — {target - stamps > 0 ? `${target - stamps} to ${rewardName}` : `${rewardName} ready`}
      </p>
    </div>
  );
}

export function StatTile({
  label,
  value,
  icon,
  delta,
  wide,
  href,
}: {
  label: string;
  value: string | number;
  icon?: ReactNode;
  delta?: string;
  wide?: boolean;
  href?: string;
}) {
  const body = (
    <div
      className={cn(
        "grain group relative flex items-start gap-3 rounded-[18px] border border-linen bg-paper p-4 shadow-[0_1px_2px_rgba(58,33,22,0.06),0_8px_24px_-18px_rgba(58,33,22,0.35)] transition-all duration-150 hover:-translate-y-0.5 hover:shadow-[0_2px_4px_rgba(58,33,22,0.08),0_18px_40px_-24px_rgba(58,33,22,0.45)]",
        wide && "sm:col-span-2",
      )}
    >
      {icon ? (
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-linen text-espresso transition-colors group-hover:bg-espresso group-hover:text-cream">
          {icon}
        </span>
      ) : null}
      <div className="min-w-0">
        <p className="label-caps truncate">{label}</p>
        <p className={cn("display-num mt-1 text-espresso", wide ? "text-[34px]" : "text-[26px]")}>{value}</p>
        {delta ? <p className="mt-0.5 text-[11px] font-semibold text-stamp">{delta}</p> : null}
      </div>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}
