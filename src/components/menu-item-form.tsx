"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { menuService } from "@/lib/firebase/services";
import { fireErrorMessage } from "@/lib/firebase/firestore";
import type { Actor, MenuItemDoc } from "@/lib/firebase/types";
import { ImagePicker } from "@/components/image-picker";
import { ToggleField } from "@/components/toggle-field";
import { emitToast } from "@/components/interactive";
import { Button, Card, Field, Input, Select, Textarea } from "@/components/ui";

export function MenuItemForm({
  actor,
  clientId,
  categories,
  item,
}: {
  actor: Actor;
  clientId: string;
  categories: { id: string; name: string; active: boolean }[];
  item: MenuItemDoc | null;
}) {
  const router = useRouter();
  const [active, setActive] = useState(item?.active ?? true);
  const [featured, setFeatured] = useState(item?.featured ?? false);
  const [name, setName] = useState(item?.name ?? "");
  const [slug, setSlug] = useState(item?.slug ?? "");
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setSaving(true);
    try {
      await menuService.saveItem(actor, clientId, item?.id ?? null, {
        name: String(fd.get("name") ?? ""),
        slug: String(fd.get("slug") ?? ""),
        categoryId: String(fd.get("categoryId") ?? ""),
        price: Number(fd.get("price") ?? 0),
        shortDescription: String(fd.get("shortDescription") ?? ""),
        fullDescription: String(fd.get("fullDescription") ?? ""),
        imageUrl: String(fd.get("imageUrl") ?? ""),
        rating: Number(fd.get("rating") ?? 4.5),
        ingredients: String(fd.get("ingredients") ?? ""),
        dietary: String(fd.get("dietary") ?? ""),
        allergens: String(fd.get("allergens") ?? ""),
        prepTimeMinutes: Number(fd.get("prepTimeMinutes") ?? 10),
        calories: Number(fd.get("calories") ?? 0),
        featured,
        active,
      });
      emitToast("success", item?.id ? "Menu item saved — customer menu updated" : "Menu item added to the customer menu");
      router.push(`/admin/clients/${clientId}/menu`);
    } catch (err) {
      emitToast("error", fireErrorMessage(err));
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <Card className="p-5">
        <Field label="Item name" required>
          <Input
            name="name"
            required
            defaultValue={item?.name ?? ""}
            placeholder="Cappuccino"
            onChange={(e) => {
              setName(e.target.value);
              if (!item?.id) setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-"));
            }}
          />
        </Field>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Slug" hint={`Customer menu anchor · #items-${slug || "item"}`}>
            <Input name="slug" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="cappuccino" />
          </Field>
          <Field label="Category">
            <Select name="categoryId" defaultValue={item?.categoryId ?? ""}>
              <option value="">Uncategorised</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.active ? "" : " (hidden)"}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Price (₹)" required>
            <Input name="price" type="number" min={0} step={1} defaultValue={item?.price ?? 180} required />
          </Field>
          <Field label="Rating (out of 5)" hint="Shown as stars on the customer menu.">
            <Input name="rating" type="number" min={0} max={5} step={0.1} defaultValue={(item?.rating10 ?? 45) / 10} />
          </Field>
        </div>
        <div className="mt-3">
          <Field label="Short description" hint="One line on the menu card.">
            <Textarea name="shortDescription" defaultValue={item?.shortDescription ?? ""} placeholder="Rich espresso topped with velvety steamed milk foam." className="min-h-16" />
          </Field>
        </div>
        <div className="mt-3">
          <Field label="Full description">
            <Textarea name="fullDescription" defaultValue={item?.fullDescription ?? ""} placeholder="A classic Italian coffee made with rich espresso and velvety steamed milk." />
          </Field>
        </div>
      </Card>

      <div className="space-y-5">
        <Card className="p-5">
          <Field label="Item image" hint="Uploads to ImgBB when you choose a file — never stored as base64 in Firestore.">
            <ImagePicker name="imageUrl" defaultValue={item?.imageUrl} aspect="aspect-[16/9]" />
          </Field>
        </Card>

        <Card className="p-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <Field label="Ingredients">
              <Input name="ingredients" defaultValue={item?.ingredients ?? ""} placeholder="Espresso, steamed milk" />
            </Field>
            <Field label="Dietary information">
              <Input name="dietary" defaultValue={item?.dietary ?? ""} placeholder="Vegetarian" />
            </Field>
            <Field label="Allergens">
              <Input name="allergens" defaultValue={item?.allergens ?? ""} placeholder="Milk, Gluten" />
            </Field>
            <Field label="Preparation time (min)">
              <Input name="prepTimeMinutes" type="number" min={0} defaultValue={item?.prepTimeMinutes ?? 8} />
            </Field>
            <Field label="Calories">
              <Input name="calories" type="number" min={0} defaultValue={item?.calories ?? 120} />
            </Field>
          </div>

          <div className="mt-4 space-y-2 border-t border-linen pt-4">
            <div className="flex items-center justify-between">
              <span className="text-[12.5px] font-bold text-espresso">Featured item</span>
              <ToggleField checked={featured} name="_featured" label="Featured" onChange={setFeatured} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[12.5px] font-bold text-espresso">Visible on menu</span>
              <ToggleField checked={active} name="_active" label="Visible" onChange={setActive} />
            </div>
            <p className="text-[11px] text-mocha">
              {name ? `“${name}”` : "This item"} {active ? "appears" : "is hidden"} on the customer menu as soon as you save.
            </p>
          </div>

          <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-linen pt-4">
            <Button type="button" variant="ghost" onClick={() => history.back()}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              <Check className="size-4" /> {saving ? "Saving…" : item?.id ? "Save item" : "Add to menu"}
            </Button>
          </div>
        </Card>
      </div>
    </form>
  );
}
