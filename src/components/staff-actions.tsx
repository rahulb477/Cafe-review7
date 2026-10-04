"use client";

import { useState } from "react";
import { KeyRound, Pencil, Plus, Trash2, UserX } from "lucide-react";
import { customerService, loyaltyService, staffService } from "@/lib/firebase/services";
import type { Actor, StaffDoc } from "@/lib/firebase/types";
import { opToast } from "@/components/admin-page";
import { Button, Field, Input, Select } from "@/components/ui";
import { Modal } from "@/components/interactive";
import { runOp } from "@/lib/use-load";

export function StaffRowActions({
  actor,
  clientId,
  clientSlug,
  staff,
  reload,
}: {
  actor: Actor;
  clientId: string;
  clientSlug: string;
  staff: StaffDoc;
  reload: () => void;
}) {
  const [open, setOpen] = useState(false);

  const save = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setOpen(false);
    runOp(
      () =>
        staffService.update(actor, clientId, staff.id, {
          name: String(fd.get("name") ?? ""),
          email: String(fd.get("email") ?? ""),
          staffId: String(fd.get("staffId") ?? ""),
          role: String(fd.get("role") ?? "STAFF") as StaffDoc["role"],
          status: String(fd.get("status") ?? "ACTIVE") as StaffDoc["status"],
        }),
      opToast(reload),
      "Staff account updated",
    );
  };

  return (
    <>
      <div className="flex flex-wrap justify-end gap-1.5">
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          <Pencil className="size-3.5" /> Edit
        </Button>
        <Button
          size="sm"
          variant={staff.status === "ACTIVE" ? "danger" : "quiet"}
          onClick={() =>
            runOp(
              () => staffService.setStatus(actor, clientId, staff.id, staff.status === "ACTIVE" ? "INACTIVE" : "ACTIVE"),
              opToast(reload),
              staff.status === "ACTIVE" ? "Staff access disabled" : "Staff access restored",
            )
          }
        >
          <UserX className="size-3.5" /> {staff.status === "ACTIVE" ? "Disable" : "Enable"}
        </Button>
        <Button
          size="sm"
          variant="quiet"
          title="Send Firebase password reset email"
          onClick={() =>
            runOp(() => staffService.resetPassword(actor, clientId, staff.email), opToast(), `Password reset email sent to ${staff.email}`)
          }
        >
          <KeyRound className="size-3.5" /> Reset
        </Button>
        <Button
          size="sm"
          variant="ghost"
          title="Remove staff document"
          onClick={() => runOp(() => staffService.removeStaff(actor, clientId, staff.id), opToast(reload), "Staff account removed")}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={`Edit ${staff.name}`}>
        <form onSubmit={save} className="space-y-3">
          <Field label="Full name" required>
            <Input name="name" defaultValue={staff.name} required />
          </Field>
          <Field label="Email address" required>
            <Input name="email" type="email" defaultValue={staff.email} required />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Staff ID">
              <Input name="staffId" defaultValue={staff.staffId} />
            </Field>
            <Field label="Role">
              <Select name="role" defaultValue={staff.role}>
                <option value="STAFF">Staff</option>
                <option value="SHIFT_LEAD">Shift lead</option>
                <option value="MANAGER">Manager</option>
              </Select>
            </Field>
          </div>
          <Field label="Status">
            <Select name="status" defaultValue={staff.status}>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </Select>
          </Field>
          <p className="text-[11px] text-mocha">
            Signs in at <span className="font-semibold text-espresso">/staff/{clientSlug}</span> with Firebase
            Authentication. Credentials live in Firebase Auth — never in Firestore.
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Save staff</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

export function AddCustomerModal({ actor, clientId, reload }: { actor: Actor; clientId: string; reload: () => void }) {
  const [open, setOpen] = useState(false);
  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setOpen(false);
    runOp(
      () =>
        customerService.create(actor, clientId, {
          name: String(fd.get("name") ?? ""),
          phone: String(fd.get("phone") ?? ""),
          email: String(fd.get("email") ?? ""),
        }),
      opToast(reload),
      "Customer added",
    );
  };
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="size-4" /> Add Customer
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Add customer">
        <form onSubmit={submit} className="space-y-3">
          <Field label="Full name" required>
            <Input name="name" required placeholder="Rahul Sharma" />
          </Field>
          <Field label="Phone">
            <Input name="phone" placeholder="+91 98450 11223" />
          </Field>
          <Field label="Email">
            <Input name="email" type="email" placeholder="rahul@example.com" />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Add customer</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

export function CustomerLoyaltyActions({
  actor,
  clientId,
  customerId,
  target,
  rewardName,
  stamps,
  reload,
}: {
  actor: Actor;
  clientId: string;
  customerId: string;
  target: number;
  rewardName: string;
  stamps: number;
  reload: () => void;
}) {
  const [mode, setMode] = useState<"add" | "adjust" | "redeem" | "reset" | null>(null);

  const adjust = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const delta = Number(fd.get("delta") ?? 1) || 1;
    const reason = String(fd.get("reason") ?? "");
    setMode(null);
    runOp(() => loyaltyService.adjust(actor, clientId, customerId, delta, reason), opToast(reload), "Stamp ledger updated");
  };

  return (
    <div className="flex flex-wrap gap-2">
      <Button onClick={() => setMode("add")}>+ Add Stamp</Button>
      <Button variant="outline" onClick={() => setMode("adjust")}>
        Adjust Stamps
      </Button>
      <Button
        variant="outline"
        disabled={stamps < target}
        onClick={() =>
          runOp(() => loyaltyService.redeem(actor, clientId, customerId), opToast(reload), `${rewardName} redeemed`)
        }
      >
        Redeem Reward
      </Button>
      <Button
        variant="danger"
        onClick={() => runOp(() => loyaltyService.reset(actor, clientId, customerId), opToast(reload), "Loyalty card reset")}
      >
        Reset Loyalty
      </Button>

      <Modal open={mode === "add" || mode === "adjust"} onClose={() => setMode(null)} title={mode === "add" ? "Add stamp" : "Adjust stamps"}>
        <form onSubmit={adjust} className="space-y-3">
          <Field label={mode === "add" ? "Stamps to add" : "Adjustment (negative removes stamps)"}>
            <Input name="delta" type="number" defaultValue={mode === "add" ? 1 : 0} />
          </Field>
          <Field label="Reason" hint="Written to the append-only activityLogs with a transaction ID.">
            <Input name="reason" defaultValue={mode === "add" ? "Visit stamp (counter)" : "Manual adjustment"} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setMode(null)}>
              Cancel
            </Button>
            <Button type="submit">Save</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
