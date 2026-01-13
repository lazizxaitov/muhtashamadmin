"use client";

import { useEffect, useState } from "react";

export type AdminLang = "ru" | "uz";

const STORAGE_KEY = "admin_lang";
const COOKIE_KEY = "admin_lang";

const readCookieLang = () => {
  if (typeof document === "undefined") return null;
  const value = document.cookie
    .split("; ")
    .find((item) => item.startsWith(`${COOKIE_KEY}=`))
    ?.split("=")[1];
  if (value === "ru" || value === "uz") return value;
  return null;
};

export function useAdminLang(defaultLang: AdminLang = "ru") {
  const [lang, setLang] = useState<AdminLang>(() => {
    if (typeof window === "undefined") return defaultLang;
    const stored = window.sessionStorage.getItem(STORAGE_KEY);
    if (stored === "ru" || stored === "uz") return stored;
    const cookieLang = readCookieLang();
    return cookieLang ?? defaultLang;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.sessionStorage.getItem(STORAGE_KEY);
    if (stored === "ru" || stored === "uz") {
      setLang(stored);
      return;
    }
    const cookieLang = readCookieLang();
    if (cookieLang) setLang(cookieLang);
  }, []);

  const t = (ru: string, uz: string) => (lang === "uz" ? uz : ru);

  return { lang, t };
}
