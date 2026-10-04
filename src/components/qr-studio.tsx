"use client";

import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { Download, Printer, QrCode } from "lucide-react";
import { Badge, Button, Card, Field, Input, SectionTitle, cn } from "./ui";
import { emitToast } from "@/components/interactive";

export type QrConfig = {
  id: string;
  type: string;
  label: string;
  tableNumber: number | null;
  heading: string;
  subtitle: string;
  path: string;
};

async function svgMarkup(text: string, dark: string, light: string) {
  return QRCode.toString(text, {
    type: "svg",
    margin: 0,
    errorCorrectionLevel: "M",
    color: { dark, light },
  });
}

/** Renders one QR with PNG / SVG download and print. */
export function QrPreview({
  config,
  clientName,
  logoUrl,
  accent,
  dark,
  size = 190,
}: {
  config: QrConfig;
  clientName: string;
  logoUrl: string | null;
  accent: string;
  dark: string;
  size?: number;
}) {
  const [svg, setSvg] = useState("");
  const target = typeof window === "undefined" ? config.path : new URL(config.path, window.location.origin).toString();

  useEffect(() => {
    let alive = true;
    const url = typeof window === "undefined" ? config.path : new URL(config.path, window.location.origin).toString();
    svgMarkup(url, dark, "#FFFFFF").then((s) => {
      if (alive) setSvg(s);
    });
    return () => {
      alive = false;
    };
  }, [config.path, dark]);

  const download = async (kind: "png" | "svg") => {
    const url = new URL(config.path, window.location.origin).toString();
    const filename = `${config.label || config.type}`.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    if (kind === "svg") {
      const blob = new Blob([await svgMarkup(url, dark, "#FFFFFF")], { type: "image/svg+xml" });
      triggerDownload(URL.createObjectURL(blob), `${filename}.svg`);
    } else {
      const png = await QRCode.toDataURL(url, { margin: 1, width: 1200, color: { dark, light: "#FFFFFF" } });
      triggerDownload(png, `${filename}.png`);
    }
    emitToast("success", `${filename}.${kind} downloaded`);
  };

  return (
    <Card className="flex flex-col items-center gap-3 p-5">
      <div className="text-center">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt={clientName} className="mx-auto mb-2 size-10 rounded-lg object-cover" />
        ) : null}
        <p className="label-caps">{clientName}</p>
        <p className="display-num mt-1 text-lg text-espresso">{config.heading || config.label}</p>
      </div>
      <div
        className="rounded-xl bg-white p-2 shadow-[0_1px_2px_rgba(58,33,22,.08)]"
        style={{ border: `2px solid ${accent}` }}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      <p className="text-[11px] break-all text-center text-mocha">{target}</p>
      <div className="mt-1 flex flex-wrap justify-center gap-2">
        <Button size="sm" variant="outline" onClick={() => download("png")}>
          <Download className="size-3.5" /> PNG
        </Button>
        <Button size="sm" variant="outline" onClick={() => download("svg")}>
          <Download className="size-3.5" /> SVG
        </Button>
        <Button size="sm" variant="quiet" onClick={() => window.print()}>
          <Printer className="size-3.5" /> Print
        </Button>
      </div>
    </Card>
  );
}

/**
 * Print designer — the memorable moment. The paper card and the acrylic stand
 * re-render live as the operator types, in the client's own brand colours.
 */
export function PrintDesigner({
  configs,
  clientName,
  logoUrl,
  brand,
}: {
  configs: QrConfig[];
  clientName: string;
  logoUrl: string | null;
  brand: { primary: string; secondary: string; accent: string; background: string };
}) {
  const [selected, setSelected] = useState(configs[0]?.id ?? "");
  const [heading, setHeading] = useState(configs[0]?.heading ?? "Scan to view our menu");
  const [subtitle, setSubtitle] = useState(configs[0]?.subtitle ?? "");
  const [colors, setColors] = useState(brand);
  const [mode, setMode] = useState<"paper" | "acrylic">("paper");
  const [svg, setSvg] = useState("");

  const config = configs.find((c) => c.id === selected) ?? configs[0];
  const path = config?.path ?? "/";

  const selectConfig = (id: string) => {
    const c = configs.find((x) => x.id === id);
    setSelected(id);
    if (c) {
      setHeading(c.heading);
      setSubtitle(c.subtitle);
    }
  };

  const target = useMemo(
    () => (typeof window === "undefined" ? path : new URL(path, window.location.origin).toString()),
    [path],
  );

  useEffect(() => {
    let alive = true;
    svgMarkup(target, colors.primary, "#FFFFFF").then((s) => {
      if (alive) setSvg(s);
    });
    return () => {
      alive = false;
    };
  }, [target, colors.primary]);

  return (
    <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
      <Card className="no-print h-fit p-5">
        <SectionTitle>Print designer</SectionTitle>
        <div className="space-y-3">
          <Field label="QR to print">
            <select
              value={selected}
              onChange={(e) => selectConfig(e.target.value)}
              className="w-full rounded-xl border border-linen bg-paper px-3.5 py-2.5"
            >
              {configs.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label || c.type}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Custom heading">
            <Input value={heading} onChange={(e) => setHeading(e.target.value)} />
          </Field>
          <Field label="Custom subtitle">
            <Input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ["Primary", "primary"],
                ["Secondary", "secondary"],
                ["Accent", "accent"],
                ["Background", "background"],
              ] as const
            ).map(([label, key]) => (
              <Field key={key} label={label}>
                <div className="flex items-center gap-2 rounded-xl border border-linen bg-paper px-2 py-1.5">
                  <input
                    type="color"
                    value={colors[key]}
                    onChange={(e) => setColors((c) => ({ ...c, [key]: e.target.value }))}
                    className="size-7 shrink-0 rounded border-0 bg-transparent p-0"
                    aria-label={`${label} colour`}
                  />
                  <span className="text-[11px] text-mocha">{colors[key]}</span>
                </div>
              </Field>
            ))}
          </div>
          <div className="flex gap-2 pt-1">
            <Button
              size="sm"
              variant={mode === "paper" ? "primary" : "outline"}
              onClick={() => setMode("paper")}
              className="flex-1"
            >
              Paper
            </Button>
            <Button
              size="sm"
              variant={mode === "acrylic" ? "primary" : "outline"}
              onClick={() => setMode("acrylic")}
              className="flex-1"
            >
              Acrylic stand
            </Button>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="flex-1" onClick={() => window.print()}>
              <Printer className="size-3.5" /> Print sheet
            </Button>
            <Button
              size="sm"
              variant="quiet"
              className="flex-1"
              onClick={async () => {
                const png = await QRCode.toDataURL(target, {
                  margin: 1,
                  width: 1200,
                  color: { dark: colors.primary, light: "#FFFFFF" },
                });
                triggerDownload(png, `${clientName.toLowerCase().replace(/\W+/g, "-")}-table-qr.png`);
              }}
            >
              <Download className="size-3.5" /> QR only
            </Button>
          </div>
          <p className="text-[11px] text-mocha">
            Saved copy stays in sync with this tenant — the QR always points at{" "}
            <span className="font-semibold text-espresso">{target}</span>.
          </p>
        </div>
      </Card>

      <div className={cn("grid place-items-center rounded-[18px] p-6", mode === "paper" ? "bg-linen/70" : "bg-espresso/90")}>
        {/* paper version */}
        <div
          className={cn(
            "w-full max-w-sm overflow-hidden transition-all duration-200",
            mode === "paper"
              ? "grain rounded-[4px] bg-paper shadow-[0_18px_40px_-24px_rgba(35,19,12,0.6)]"
              : "hidden",
          )}
          style={{ background: colors.background }}
        >
          <div className="px-7 pb-8 pt-9 text-center">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt={clientName} className="mx-auto mb-3 size-14 rounded-2xl object-cover" />
            ) : (
              <QrCode className="mx-auto mb-3 size-8" style={{ color: colors.primary }} />
            )}
            <p className="label-caps" style={{ color: colors.accent }}>
              {clientName}
            </p>
            <h3 className="display-num mt-2 text-[30px] leading-none" style={{ color: colors.primary }}>
              {heading}
            </h3>
            <p className="mt-2 text-[12px]" style={{ color: colors.secondary }}>
              {subtitle}
            </p>
            <div
              className="mx-auto mt-6 w-[190px] rounded-lg bg-white p-2"
              style={{ border: `3px solid ${colors.accent}` }}
              dangerouslySetInnerHTML={{ __html: svg }}
            />
            <p className="mt-4 text-[10px] font-bold tracking-[0.18em] uppercase" style={{ color: colors.secondary }}>
              Point your camera · order · earn stamps
            </p>
          </div>
          <div className="h-2 w-full" style={{ background: colors.accent }} />
        </div>

        {/* acrylic stand version */}
        {mode === "acrylic" ? (
          <div className="w-full max-w-sm">
            <div className="relative rounded-[10px] border border-cream/25 bg-gradient-to-b from-cream/25 to-cream/5 p-1 shadow-[0_30px_60px_-30px_rgba(0,0,0,0.9)] backdrop-blur-sm">
              <div className="rounded-[8px] px-7 py-9 text-center" style={{ background: `${colors.background}f2` }}>
                {logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoUrl} alt={clientName} className="mx-auto mb-3 size-12 rounded-xl object-cover" />
                ) : null}
                <p className="label-caps" style={{ color: colors.accent }}>
                  {clientName}
                </p>
                <h3 className="display-num mt-1.5 text-[26px] leading-none" style={{ color: colors.primary }}>
                  {heading}
                </h3>
                <p className="mt-1.5 text-[11px]" style={{ color: colors.secondary }}>
                  {subtitle}
                </p>
                <div
                  className="mx-auto mt-5 w-[168px] rounded-lg bg-white p-2"
                  style={{ border: `2px solid ${colors.accent}` }}
                  dangerouslySetInnerHTML={{ __html: svg }}
                />
              </div>
              <div className="pointer-events-none absolute inset-x-6 top-0 h-16 rotate-6 bg-gradient-to-b from-white/25 to-transparent" />
            </div>
            <div className="mx-auto h-3 w-2/3 rounded-b-[10px] bg-cream/25" />
            <div className="mx-auto h-1.5 w-3/4 rounded-b-[10px] bg-cream/15" />
            <p className="mt-4 text-center text-[10px] font-bold tracking-[0.18em] text-cream/60 uppercase">
              Counter-top acrylic stand · 10 × 15 cm
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function QrLegend({ count }: { count: number }) {
  return (
    <Badge tone="neutral">
      <QrCode className="size-3" /> {count} codes
    </Badge>
  );
}

function triggerDownload(href: string, filename: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  a.click();
}
