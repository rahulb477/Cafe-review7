"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { ClientPage, type ClientCtx } from "@/components/admin-page";
import { Button, Card, Field, Input, PageHeader, SectionTitle, Select } from "@/components/ui";
import { emitToast } from "@/components/interactive";
import { staffService } from "@/lib/firebase/services";
import { authErrorMessage } from "@/lib/firebase/auth";

export default function NewStaffPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = use(params);
  return <ClientPage clientId={clientId}>{(ctx) => <NewStaff ctx={ctx} />}</ClientPage>;
}

function NewStaff({ ctx }: { ctx: ClientCtx }) {
  const { client, actor } = ctx;
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setSaving(true);
    try {
      await staffService.create(actor, client.id, {
        name: String(fd.get("name") ?? ""),
        email: String(fd.get("email") ?? ""),
        staffId: String(fd.get("staffId") ?? ""),
        password: String(fd.get("password") ?? ""),
        role: String(fd.get("role") ?? "STAFF"),
        status: String(fd.get("status") ?? "ACTIVE"),
      });
      emitToast("success", `Staff account created — they can sign in at /staff/${client.slug}`);
      router.push(`/admin/clients/${client.id}/staff`);
    } catch (err) {
      emitToast("error", authErrorMessage(err));
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow={client.displayName}
        title="Create Staff Account"
        subtitle={`A Firebase Auth user is created (on a secondary app instance, so your session is untouched) plus a staffUsers/{uid} document.`}
      />

      <form onSubmit={submit} className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="p-5">
          <SectionTitle>Account</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Full name" required className="sm:col-span-2">
              <Input name="name" required placeholder="Rohit Kumar" />
            </Field>
            <Field label="Email address" required className="sm:col-span-2">
              <Input name="email" type="email" required placeholder="rohit@bake.com" />
            </Field>
            <Field label="Staff ID" hint="Leave blank to generate one.">
              <Input name="staffId" placeholder="BAKE001" />
            </Field>
            <Field label="Password" required hint="Handled by Firebase Auth — minimum 6 characters.">
              <Input name="password" type="password" required minLength={6} placeholder="••••••••" />
            </Field>
            <Field label="Role">
              <Select name="role" defaultValue="STAFF">
                <option value="STAFF">Staff</option>
                <option value="SHIFT_LEAD">Shift lead</option>
                <option value="MANAGER">Manager</option>
              </Select>
            </Field>
            <Field label="Status">
              <Select name="status" defaultValue="ACTIVE">
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
              </Select>
            </Field>
          </div>
          <div className="mt-5 flex justify-end gap-2 border-t border-linen pt-4">
            <Button type="button" variant="ghost" onClick={() => history.back()}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Creating…" : "Create Staff"}
            </Button>
          </div>
        </Card>

        <Card className="h-fit p-5">
          <SectionTitle>What this unlocks</SectionTitle>
          <ul className="list-inside list-disc space-y-1.5 text-[12px] text-mocha">
            <li>Sign in to /staff/{client.slug} with Firebase Authentication.</li>
            <li>Add and redeem stamps at the counter.</li>
            <li>Sees the live loyalty target and reward name from the client document.</li>
            <li>Blocked automatically if the business is suspended or the account disabled.</li>
          </ul>
        </Card>
      </form>
    </>
  );
}
