"use client";

import { use } from "react";
import { Plus, QrCode } from "lucide-react";
import { ClientPage, opToast, type ClientCtx } from "@/components/admin-page";
import { PrintDesigner, QrPreview, type QrConfig } from "@/components/qr-studio";
import {
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  PageHeader,
  SectionTitle,
  Select,
  SkeletonRows,
} from "@/components/ui";
import { qrService } from "@/lib/firebase/services";
import { runOp, useLoad } from "@/lib/use-load";

export default function QrPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = use(params);
  return <ClientPage clientId={clientId}>{(ctx) => <QrStudio ctx={ctx} />}</ClientPage>;
}

function QrStudio({ ctx }: { ctx: ClientCtx }) {
  const { client, settings, actor } = ctx;
  const load = useLoad(() => qrService.list(client.id), [client.id]);

  const withPaths: QrConfig[] = (load.data ?? []).map((c) => ({
    id: c.id,
    type: c.type,
    label: c.label,
    tableNumber: c.tableNumber,
    heading: c.heading,
    subtitle: c.subtitle,
    path: qrService.path(client.slug, c),
  }));

  const createQr = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const tableRaw = String(fd.get("tableNumber") ?? "");
    runOp(
      () =>
        qrService.createConfig(actor, client.id, {
          type: String(fd.get("type") ?? "MAIN") as "MAIN" | "COUNTER" | "TABLE",
          label: String(fd.get("label") ?? ""),
          tableNumber: tableRaw ? Number(tableRaw) : null,
          heading: String(fd.get("heading") ?? ""),
          subtitle: String(fd.get("subtitle") ?? ""),
        }),
      opToast(load.reload),
      "QR code generated",
    );
  };

  return (
    <>
      <PageHeader
        eyebrow={`${withPaths.length} codes · always pointing at /${client.slug}`}
        title="Store QR"
        subtitle="Generate entrance, counter and table codes, then lay them out for print or an acrylic stand."
      />

      <Card className="mb-5 p-5">
        <SectionTitle>Generate a code</SectionTitle>
        <form onSubmit={createQr} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Field label="Type">
            <Select name="type" defaultValue="TABLE">
              <option value="MAIN">Main QR</option>
              <option value="COUNTER">Counter QR</option>
              <option value="TABLE">Table QR</option>
            </Select>
          </Field>
          <Field label="Label">
            <Input name="label" placeholder="Table 5" required />
          </Field>
          <Field label="Table number" hint="Only for table codes.">
            <Input name="tableNumber" type="number" min={1} placeholder="5" />
          </Field>
          <Field label="Heading">
            <Input name="heading" defaultValue="Scan to view our menu" />
          </Field>
          <Field label="Subtitle">
            <Input name="subtitle" defaultValue={client.tagline} />
          </Field>
          <div className="flex justify-end sm:col-span-2 lg:col-span-5">
            <Button type="submit">
              <Plus className="size-4" /> Generate QR
            </Button>
          </div>
        </form>
      </Card>

      {load.loading && !load.data ? (
        <SkeletonRows rows={3} />
      ) : withPaths.length === 0 ? (
        <EmptyState
          title="No QR codes yet"
          body="Generate your first code — every code points at this business and nothing else."
          icon={<QrCode className="size-5" />}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {withPaths.map((cfg) => (
            <div key={cfg.id} className="relative">
              <QrPreview
                config={cfg}
                clientName={client.displayName}
                logoUrl={client.logoUrl}
                accent={settings.accentColor}
                dark={settings.primaryColor}
              />
              <div className="no-print mt-2 space-y-2">
                <QrEditForm cfg={cfg} ctx={ctx} reload={load.reload} />
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => runOp(() => qrService.removeConfig(actor, client.id, cfg.id), opToast(load.reload), "QR code removed")}
                >
                  Remove code
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {withPaths.length ? (
        <div className="mt-8">
          <SectionTitle right={<span className="text-[11px] text-mocha">paper + acrylic</span>}>Print designer</SectionTitle>
          <PrintDesigner
            configs={withPaths}
            clientName={client.displayName}
            logoUrl={client.logoUrl}
            brand={{
              primary: settings.primaryColor,
              secondary: settings.secondaryColor,
              accent: settings.accentColor,
              background: settings.backgroundColor,
            }}
          />
        </div>
      ) : null}
    </>
  );
}

function QrEditForm({ cfg, ctx, reload }: { cfg: QrConfig; ctx: ClientCtx; reload: () => void }) {
  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    runOp(
      () =>
        qrService.updateConfig(ctx.actor, ctx.client.id, cfg.id, {
          label: String(fd.get("label") ?? ""),
          heading: String(fd.get("heading") ?? ""),
          subtitle: String(fd.get("subtitle") ?? ""),
        }),
      opToast(reload),
      "QR label updated",
    );
  };
  return (
    <form onSubmit={submit} className="grid grid-cols-2 gap-2">
      <Input name="label" defaultValue={cfg.label} className="col-span-2" />
      <Input name="heading" defaultValue={cfg.heading} className="col-span-2" />
      <Input name="subtitle" defaultValue={cfg.subtitle} className="col-span-2" />
      <Button type="submit" size="sm" variant="outline" className="col-span-2">
        Save label
      </Button>
    </form>
  );
}
