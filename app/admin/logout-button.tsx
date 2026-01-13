"use client";

import { useRouter } from "next/navigation";
import { useAdminLang } from "./use-admin-lang";

export default function LogoutButton() {
  const router = useRouter();
  const { t } = useAdminLang();

  const handleLogout = async () => {
    await fetch("/api/logout", { method: "POST" });
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem("admin_lang");
    }
    router.push("/");
    router.refresh();
  };

  return (
    <button
      type="button"
      onClick={handleLogout}
      className="text-xs text-white/70 underline-offset-4 transition hover:text-white hover:underline"
    >
      {t("Выйти", "Chiqish")}
    </button>
  );
}
