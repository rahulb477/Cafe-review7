"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, Check, Info, X } from "lucide-react";
import { cn } from "@/lib/format";

/* ---------------- Toggle ---------------- */

export function Toggle({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label?: string;
  onChange?: (value: boolean) => void;
}) {
  const [on, setOn] = useState(checked);
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label ?? "toggle"}
      onClick={() => {
        const next = !on;
        setOn(next);
        onChange?.(next);
      }}
      className={cn("relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200", on ? "bg-stamp" : "bg-mocha/35")}
    >
      <span
        className={cn(
          "absolute top-0.5 size-5 rounded-full bg-paper shadow transition-transform duration-200 [transition-timing-function:cubic-bezier(.34,1.56,.64,1)]",
          on ? "translate-x-[22px]" : "translate-x-0.5",
        )}
      />
    </button>
  );
}

/* ---------------- Modal ---------------- */

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-bean/45 p-0 backdrop-blur-[2px] sm:items-center sm:p-6">
      <div className="absolute inset-0" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="modal-in relative z-10 max-h-[92dvh] w-full overflow-y-auto rounded-t-[22px] bg-paper shadow-[0_24px_60px_-20px_rgba(35,19,12,0.5)] sm:max-w-lg sm:rounded-[22px]"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-linen bg-paper px-5 py-4">
          <h2 className="display-num text-xl text-espresso">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-mocha transition-colors hover:bg-linen hover:text-espresso"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-5">{children}</div>
        {footer ? (
          <div className="sticky bottom-0 flex justify-end gap-2 border-t border-linen bg-paper px-5 py-3">{footer}</div>
        ) : null}
      </div>
    </div>
  );
}

/* ---------------- Toasts ---------------- */

type Toast = { id: number; tone: "success" | "error" | "info"; text: string };
const ToastCtx = createContext<(tone: Toast["tone"], text: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function emitToast(tone: Toast["tone"], text: string) {
  window.dispatchEvent(new CustomEvent("grounds:toast", { detail: { tone, text } }));
}

export function ToastHost({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const seq = useRef(0);
  const push = useCallback((tone: Toast["tone"], text: string) => {
    const id = ++seq.current;
    setItems((prev) => [...prev, { id, tone, text }]);
    setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), 4200);
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { tone: Toast["tone"]; text: string };
      push(detail.tone, detail.text);
    };
    window.addEventListener("grounds:toast", handler);
    return () => window.removeEventListener("grounds:toast", handler);
  }, [push]);

  const value = useMemo(() => push, [push]);
  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 sm:bottom-6 sm:right-6 sm:left-auto sm:items-end">
        {items.map((t) => (
          <div
            key={t.id}
            className={cn(
              "toast-in pointer-events-auto flex max-w-sm items-center gap-2 rounded-xl px-4 py-2.5 text-[12px] font-semibold shadow-[0_12px_30px_-14px_rgba(35,19,12,0.6)]",
              t.tone === "success" && "bg-espresso text-cream",
              t.tone === "error" && "bg-ember text-cream",
              t.tone === "info" && "border border-linen bg-paper text-espresso",
            )}
          >
            {t.tone === "success" ? (
              <Check className="size-4" />
            ) : t.tone === "error" ? (
              <AlertTriangle className="size-4" />
            ) : (
              <Info className="size-4" />
            )}
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/** Reads ?toast= from a server-action redirect and surfaces it. */
export function ToastFromQuery() {
  const params = useSearchParams();
  const fired = useRef(false);
  useEffect(() => {
    const text = params.get("toast");
    if (text && !fired.current) {
      fired.current = true;
      emitToast((params.get("tone") as Toast["tone"]) ?? "success", text);
    }
  }, [params]);
  return null;
}

/* ---------------- Chart (hand-drawn SVG) ---------------- */

export function BarChart({
  data,
  labels,
  height = 150,
  tone = "#5A3524",
  unit = "",
}: {
  data: number[];
  labels: string[];
  height?: number;
  tone?: string;
  unit?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data);
  const width = 100;
  const gap = 0.25;
  const bw = (width - gap * (data.length - 1)) / Math.max(1, data.length);
  return (
    <div className="relative w-full">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ height }} preserveAspectRatio="none">
        {[0.25, 0.5, 0.75].map((g) => (
          <line key={g} x1="0" x2={width} y1={height * g} y2={height * g} stroke="#EFE3D2" strokeWidth="0.5" />
        ))}
        {data.map((v, i) => {
          const h = (v / max) * (height - 12);
          return (
            <rect
              key={i}
              x={i * (bw + gap)}
              y={height - h}
              width={bw}
              height={Math.max(h, 1)}
              rx="0.6"
              fill={tone}
              opacity={hover === null || hover === i ? 0.92 : 0.35}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              style={{ transition: "opacity .15s" }}
            />
          );
        })}
      </svg>
      {hover !== null ? (
        <div
          className="pointer-events-none absolute -top-1 rounded-lg bg-espresso px-2 py-1 text-[10px] font-bold text-cream"
          style={{ left: `${(hover / Math.max(1, data.length - 1)) * 88}%` }}
        >
          {data[hover]} {unit} · {labels[hover]}
        </div>
      ) : null}
      <div className="mt-1 flex justify-between text-[10px] text-mocha">
        <span>{labels[0]}</span>
        <span>{labels[Math.floor(labels.length / 2)]}</span>
        <span>{labels[labels.length - 1]}</span>
      </div>
    </div>
  );
}
