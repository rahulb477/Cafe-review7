"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
import { menuService } from "@/lib/firebase/services";
import type { Actor, MenuCategoryDoc } from "@/lib/firebase/types";
import { opToast } from "@/components/admin-page";
import { Badge, Button, Field, Input } from "@/components/ui";
import { Modal } from "@/components/interactive";
import { runOp } from "@/lib/use-load";

export type CategoryRow = MenuCategoryDoc & { itemCount: number };

export function CategoryManager({
  actor,
  clientId,
  categories,
  reload,
}: {
  actor: Actor;
  clientId: string;
  categories: CategoryRow[];
  reload: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CategoryRow | null>(null);
  const ordered = [...categories].sort((a, b) => a.sortOrder - b.sortOrder);
  const ids = ordered.map((c) => c.id);

  const move = (index: number, dir: -1 | 1) => {
    const next = [...ids];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    runOp(() => menuService.reorderCategories(actor, clientId, next), opToast(reload), "Category order saved");
  };

  const save = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = String(fd.get("name") ?? "");
    const editId = editing?.id ?? null;
    const active = editing?.active ?? true;
    setOpen(false);
    setEditing(null);
    runOp(
      () => menuService.saveCategory(actor, clientId, editId, name, active),
      opToast(reload),
      editId ? "Category renamed" : "Category added",
    );
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {ordered.map((c, i) => (
          <span key={c.id} className="inline-flex items-center gap-1.5 rounded-full border border-linen bg-paper px-2.5 py-1 text-[11.5px] font-semibold">
            <span className={c.active ? "text-espresso" : "text-mocha line-through"}>{c.name}</span>
            <span className="text-[10px] text-mocha">{c.itemCount}</span>
            <button onClick={() => move(i, -1)} title="Move up" className="text-mocha hover:text-espresso">
              <ArrowUp className="size-3" />
            </button>
            <button onClick={() => move(i, 1)} title="Move down" className="text-mocha hover:text-espresso">
              <ArrowDown className="size-3" />
            </button>
            <button onClick={() => setEditing(c)} title="Rename" className="text-mocha hover:text-espresso">
              <Pencil className="size-3" />
            </button>
            <button
              onClick={() => runOp(() => menuService.saveCategory(actor, clientId, c.id, c.name, !c.active), opToast(reload), c.active ? "Category hidden" : "Category visible")}
              title={c.active ? "Hide on customer menu" : "Show on customer menu"}
              className="text-mocha hover:text-espresso"
            >
              {c.active ? "◉" : "○"}
            </button>
            <button
              onClick={() => runOp(() => menuService.deleteCategory(actor, clientId, c.id), opToast(reload), "Category removed (items kept)")}
              title="Delete category"
              className="text-mocha hover:text-ember"
            >
              <Trash2 className="size-3" />
            </button>
          </span>
        ))}
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          <Plus className="size-3.5" /> Category
        </Button>
        {ordered.length === 0 ? <Badge tone="neutral">No categories yet</Badge> : null}
      </div>

      <Modal
        open={open || Boolean(editing)}
        onClose={() => {
          setOpen(false);
          setEditing(null);
        }}
        title={editing ? "Edit category" : "Add category"}
      >
        <form onSubmit={save} className="space-y-3">
          <Field label="Category name" required>
            <Input name="name" defaultValue={editing?.name ?? ""} placeholder="Coffee" required />
          </Field>
          <p className="text-[11px] text-mocha">
            Renaming or reordering updates the customer menu instantly. Deleting keeps its items — they become uncategorised.
          </p>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setOpen(false);
                setEditing(null);
              }}
            >
              Cancel
            </Button>
            <Button type="submit">{editing ? "Save category" : "Add category"}</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
