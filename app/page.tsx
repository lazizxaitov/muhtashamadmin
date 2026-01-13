"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const [language, setLanguage] = useState<"uz" | "ru" | null>(null);
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "ok">(
    "idle"
  );
  const [showPassword, setShowPassword] = useState(false);
  const isUz = language === "uz";
  const router = useRouter();

  const handleSelectLanguage = (next: "uz" | "ru") => {
    setLanguage(next);
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem("admin_lang", next);
      document.cookie = `admin_lang=${next}; path=/; max-age=31536000`;
    }
  };

  useEffect(() => {
    if (status === "ok") {
      router.push("/admin");
    }
  }, [router, status]);

  const handleLogin = async () => {
    setStatus("loading");
    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login, password }),
      });

      setStatus(response.ok ? "ok" : "error");
    } catch {
      setStatus("error");
    }
  };

  return (
    <div className="relative min-h-screen text-white">
      <Image
        src="/ornament.png"
        alt=""
        width={512}
        height={1536}
        className="pointer-events-none absolute left-0 top-0 h-[70vh] w-auto -translate-x-10 opacity-70"
        priority
      />
      <Image
        src="/ornament.png"
        alt=""
        width={512}
        height={1536}
        className="pointer-events-none absolute bottom-0 right-0 h-[70vh] w-auto translate-x-10 rotate-180 opacity-70"
        priority
      />
      <main className="flex min-h-screen items-center justify-center px-6 py-16">
        <div className="flex w-full max-w-3xl flex-col items-center gap-10 text-center lg:-mt-40">
          <Image
            src="/logo.png"
            alt="Muhtasham"
            width={900}
            height={450}
            className="w-full max-w-[220px] sm:max-w-[260px] md:max-w-[300px] drop-shadow-[0_18px_35px_rgba(0,0,0,0.45)]"
            priority
          />
          {!language && (
            <section className="w-full max-w-[520px] text-center">
              <Image
                src="/ornament-top-v2.png"
                alt=""
                width={900}
                height={160}
                className="mx-auto h-12 sm:h-16 w-auto opacity-90"
                priority
              />
              <p className="mt-4 font-[family:var(--font-display)] text-2xl tracking-[0.2em]">
                Выберите язык
              </p>
              <div className="mt-6 grid gap-6 sm:grid-cols-2">
                <button
                  className="group flex flex-col items-center gap-4 rounded-3xl border border-white/15 bg-white/5 px-6 py-6 transition hover:border-white/40 hover:bg-white/10"
                  type="button"
                  onClick={() => handleSelectLanguage("uz")}
                >
                  <div className="h-20 w-28 overflow-hidden rounded-2xl shadow-[0_10px_20px_rgba(0,0,0,0.35)]">
                    <div className="h-1/3 bg-[#1eb4c8]" />
                    <div className="h-1/3 bg-white" />
                    <div className="h-1/3 bg-[#2bbd4a]" />
                  </div>
                  <span className="text-lg text-white/90">O&apos;zbek tili</span>
                </button>
                <button
                  className="group flex flex-col items-center gap-4 rounded-3xl border border-white/15 bg-white/5 px-6 py-6 transition hover:border-white/40 hover:bg-white/10"
                  type="button"
                  onClick={() => handleSelectLanguage("ru")}
                >
                  <div className="h-20 w-28 overflow-hidden rounded-2xl shadow-[0_10px_20px_rgba(0,0,0,0.35)]">
                    <div className="h-1/3 bg-white" />
                    <div className="h-1/3 bg-[#2167b8]" />
                    <div className="h-1/3 bg-[#e12d2d]" />
                  </div>
                  <span className="text-lg text-white/90">Русский язык</span>
                </button>
              </div>
              <Image
                src="/ornament-bottom-v2.png"
                alt=""
                width={900}
                height={160}
                className="mx-auto mt-6 h-12 sm:h-16 w-auto opacity-90"
                priority
              />
            </section>
          )}
          {language && (
            <section className="relative w-full max-w-[560px] rounded-[36px] bg-[#dbe8d9] px-6 py-8 text-[#6a7b6e] shadow-[0_30px_60px_rgba(0,0,0,0.35)] sm:px-8 sm:py-10">
              <div className="relative flex w-full items-center justify-center">
                <button
                  type="button"
                  onClick={() => {
                    setLanguage(null);
                    if (typeof window !== "undefined") {
                      window.sessionStorage.removeItem("admin_lang");
                      document.cookie = "admin_lang=; path=/; max-age=0";
                    }
                  }}
                  aria-label="Back"
                  className="absolute left-0 inline-flex h-10 w-10 items-center justify-center rounded-full border-2 border-[#00600b] text-[#00600b] transition hover:border-[#0b7a1a] hover:text-[#0b7a1a] sm:h-12 sm:w-12"
                >
                  <svg
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    className="h-5 w-5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M15 18l-6-6 6-6" />
                  </svg>
                </button>
                <h2 className="text-3xl font-[family:var(--font-display)] text-[#00600b] sm:text-4xl">
                  {isUz ? "Kirish" : "Вход"}
                </h2>
              </div>
              <p className="mt-4 text-lg">
                {isUz ? "Akkauntingizga kiring" : "Войдите в свой аккаунт"}
                <span className="block tracking-[0.12em] text-[#6b7a6e]">
                  MUHTASHAM ADMIN
                </span>
              </p>
              <div className="mt-8 flex flex-col gap-5">
                <input
                  type="text"
                  placeholder={isUz ? "Login" : "Логин"}
                  value={login}
                  onChange={(event) => setLogin(event.target.value)}
                  className="h-16 rounded-2xl border border-white/80 bg-white/90 px-6 text-lg text-[#7b8a80] shadow-[inset_0_0_0_2px_rgba(255,255,255,0.6)] focus:outline-none"
                />
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder={isUz ? "Parol" : "Пароль"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="h-16 w-full rounded-2xl border border-white/80 bg-white/90 px-6 pr-14 text-lg text-[#7b8a80] shadow-[inset_0_0_0_2px_rgba(255,255,255,0.6)] focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-[#9aa69d] transition hover:text-[#6a7b6e]"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                      className="h-5 w-5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      {showPassword ? (
                        <>
                          <path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6-10-6-10-6" />
                          <circle cx="12" cy="12" r="3" />
                        </>
                      ) : (
                        <>
                          <path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6-10-6-10-6" />
                          <path d="M3 3l18 18" />
                        </>
                      )}
                    </svg>
                  </button>
                </div>
              </div>
              <button
                className="mt-8 h-16 w-full rounded-2xl bg-[#2f7d3c] text-xl font-semibold text-white shadow-[0_14px_24px_rgba(23,71,32,0.4)] transition hover:bg-[#2a6f35] disabled:cursor-not-allowed disabled:opacity-70"
                type="button"
                onClick={handleLogin}
                disabled={!login || !password || status === "loading"}
              >
                {status === "loading"
                  ? isUz
                    ? "Tekshirilmoqda..."
                    : "Проверка..."
                  : isUz
                  ? "Kirish"
                  : "Войти"}
              </button>
              {status === "error" && (
                <p className="mt-4 text-sm text-[#b14b4b]">
                  {isUz
                    ? "Login yoki parol noto'g'ri."
                    : "Неверный логин или пароль."}
                </p>
              )}
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
