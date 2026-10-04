"use client";

import { use } from "react";
import { ExternalLink, Wifi } from "lucide-react";
import { ClientPage, opToast, type ClientCtx } from "@/components/admin-page";
import { ImagePicker } from "@/components/image-picker";
import { ToggleField } from "@/components/toggle-field";
import {
  Button,
  Card,
  Field,
  Input,
  LinkButton,
  PageHeader,
  SectionTitle,
  Textarea,
} from "@/components/ui";
import { clientService } from "@/lib/firebase/services";
import { runOp } from "@/lib/use-load";

export default function BrandingPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = use(params);
  return <ClientPage clientId={clientId}>{(ctx) => <Branding ctx={ctx} />}</ClientPage>;
}

function Branding({ ctx }: { ctx: ClientCtx }) {
  const { client, settings, actor } = ctx;

  const saveBranding = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const str = (k: string) => String(fd.get(k) ?? "").trim();
    runOp(
      async () => {
        await clientService.update(actor, client.id, {
          logoUrl: str("logoUrl") || null,
          faviconUrl: str("faviconUrl") || null,
          coverImageUrl: str("coverImageUrl") || null,
        });
        await clientService.updateSettings(actor, client.id, {
          primaryColor: str("primaryColor"),
          secondaryColor: str("secondaryColor"),
          accentColor: str("accentColor"),
          backgroundColor: str("backgroundColor"),
          textColor: str("textColor"),
        });
      },
      opToast(ctx.reloadClient),
      "Branding & theme published to the customer app",
    );
  };

  const saveIntegrations = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const str = (k: string) => String(fd.get(k) ?? "").trim();
    runOp(
      () =>
        clientService.updateSettings(
          actor,
          client.id,
          {
            googleReviewUrl: str("googleReviewUrl"),
            instagram: str("instagram"),
            facebook: str("facebook"),
            youtube: str("youtube"),
            website: str("website"),
            wifiEnabled: fd.get("wifiEnabled") === "true",
            wifiSsid: str("wifiSsid"),
            wifiMessage: str("wifiMessage"),
          },
          "GOOGLE_URL_CHANGED",
        ),
      opToast(ctx.reloadClient),
      "Google, social & Wi-Fi updated",
    );
  };

  const colors: [string, string, string][] = [
    ["Primary", "primaryColor", settings.primaryColor],
    ["Secondary", "secondaryColor", settings.secondaryColor],
    ["Accent", "accentColor", settings.accentColor],
    ["Background", "backgroundColor", settings.backgroundColor],
    ["Text", "textColor", settings.textColor],
  ];

  return (
    <>
      <PageHeader
        eyebrow={client.displayName}
        title="Store Branding"
        subtitle="Everything here publishes straight to the customer and staff apps via Firestore."
        actions={
          <>
            <LinkButton href={`/${client.slug}`} external variant="outline">
              <ExternalLink className="size-3.5" /> View Customer App
            </LinkButton>
            <LinkButton href={`/${client.slug}/menu`} external variant="outline">
              <ExternalLink className="size-3.5" /> View Customer Menu
            </LinkButton>
          </>
        }
      />

      <form onSubmit={saveBranding} className="grid gap-5 lg:grid-cols-2">
        <Card className="p-5">
          <SectionTitle>Logo & imagery</SectionTitle>
          <div className="space-y-5">
            <Field label="Logo" hint="Uploads to ImgBB when you choose a file; only the URL is saved.">
              <ImagePicker name="logoUrl" defaultValue={client.logoUrl} round />
            </Field>
            <Field label="Favicon">
              <ImagePicker name="faviconUrl" defaultValue={client.faviconUrl} round />
            </Field>
            <Field label="Cover image">
              <ImagePicker name="coverImageUrl" defaultValue={client.coverImageUrl} aspect="aspect-[16/9]" />
            </Field>
          </div>
        </Card>

        <Card className="p-5">
          <SectionTitle>Theme colours</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-2">
            {colors.map(([label, name, value]) => (
              <Field key={name} label={label}>
                <div className="flex items-center gap-2 rounded-xl border border-linen bg-paper px-2 py-1.5">
                  <input type="color" name={name} defaultValue={value} className="size-8 rounded border-0 bg-transparent p-0" />
                  <span className="text-[11px] text-mocha">{value}</span>
                </div>
              </Field>
            ))}
          </div>

          <div className="mt-4 rounded-2xl p-5" style={{ background: settings.backgroundColor, color: settings.textColor }}>
            <p className="label-caps" style={{ color: settings.accentColor }}>
              Customer app preview
            </p>
            <p className="display-num mt-1 text-[26px] leading-none" style={{ color: settings.primaryColor }}>
              {client.displayName}
            </p>
            <p className="mt-1 text-[12px]" style={{ color: settings.secondaryColor }}>
              {client.tagline}
            </p>
            <span
              className="mt-3 inline-block rounded-xl px-4 py-2 text-[12px] font-bold"
              style={{ background: settings.primaryColor, color: settings.backgroundColor }}
            >
              View Menu
            </span>
          </div>

          <div className="mt-5 flex justify-end border-t border-linen pt-4">
            <Button type="submit">Save branding</Button>
          </div>
        </Card>
      </form>

      <form onSubmit={saveIntegrations} className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card className="p-5">
          <SectionTitle>Google review & social</SectionTitle>
          <div className="space-y-3">
            <Field label="Google review URL" hint="Guests land on this exact link when they tap “Review us”.">
              <Input name="googleReviewUrl" type="url" defaultValue={settings.googleReviewUrl} placeholder="https://g.page/r/your-cafe/review" />
            </Field>
            <LinkButton
              href={settings.googleReviewUrl || "#"}
              external
              size="sm"
              variant="quiet"
              className={!settings.googleReviewUrl ? "pointer-events-none opacity-40" : ""}
            >
              Test Google Review
            </LinkButton>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Instagram">
                <Input name="instagram" defaultValue={settings.instagram} placeholder="https://instagram.com/…" />
              </Field>
              <Field label="Facebook">
                <Input name="facebook" defaultValue={settings.facebook} placeholder="https://facebook.com/…" />
              </Field>
              <Field label="YouTube">
                <Input name="youtube" defaultValue={settings.youtube} placeholder="https://youtube.com/@…" />
              </Field>
              <Field label="Website">
                <Input name="website" defaultValue={settings.website} placeholder="https://…" />
              </Field>
            </div>
            <p className="text-[11px] text-mocha">Only links you fill in appear in the customer app — empty ones are omitted.</p>
          </div>
        </Card>

        <Card className="p-5">
          <SectionTitle>Wi-Fi sharing</SectionTitle>
          <div className="mb-3 flex items-center justify-between rounded-xl border border-linen bg-paper px-4 py-3">
            <div className="flex items-center gap-2">
              <Wifi className="size-4 text-espresso" />
              <div>
                <p className="text-[13px] font-bold text-espresso">Show Wi-Fi to guests</p>
                <p className="text-[11px] text-mocha">Hides the option completely when switched off.</p>
              </div>
            </div>
            <ToggleField checked={settings.wifiEnabled} name="wifiEnabled" label="Wi-Fi" />
          </div>
          <div className="space-y-3">
            <Field label="Network name (SSID)">
              <Input name="wifiSsid" defaultValue={settings.wifiSsid} placeholder="BAKE-Guest" />
            </Field>
            <Field label="Customer-facing message">
              <Textarea name="wifiMessage" defaultValue={settings.wifiMessage} placeholder="You're connected — enjoy a slow coffee on us." />
            </Field>
            <p className="text-[11px] text-mocha">
              The Wi-Fi password itself is never written to Firestore — it stays at the counter.
            </p>
          </div>
          <div className="mt-5 flex justify-end border-t border-linen pt-4">
            <Button type="submit">Save integrations</Button>
          </div>
        </Card>
      </form>
    </>
  );
}
