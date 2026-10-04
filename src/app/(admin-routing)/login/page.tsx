"use client";

import { AliasRedirect } from "@/components/setup-screen";

/** /login alias → the project's existing Firebase sign-in page (/admin/login). */
export default function LoginAliasPage() {
  return (
    <AliasRedirect superAdminHref="/admin/login" normalAdminHref="/admin/login" label="Opening sign in…" />
  );
}
