import Image from "next/image";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionCookieName, verifySessionToken } from "@/lib/auth";
import AdminHeader from "./admin-header";

type AdminLayoutProps = {
  children: React.ReactNode;
};

export default async function AdminLayout({ children }: AdminLayoutProps) {
  const cookieStore = await cookies();
  const session = cookieStore.get(getSessionCookieName());
  const secret = process.env.ADMIN_SESSION_SECRET ?? "";
  const langCookie = cookieStore.get("admin_lang")?.value;
  const adminLang = langCookie === "uz" || langCookie === "ru" ? langCookie : "ru";

  if (!session?.value || !secret) {
    redirect("/");
  }

  const payload = verifySessionToken(session.value, secret);
  if (!payload) {
    redirect("/");
  }

  return (
    <div className="relative min-h-screen bg-[#00600b] text-white">
      <div className="pointer-events-none absolute left-0 top-0 h-[70vh] w-auto -translate-x-10 opacity-70">
        <Image
          src="/ornament.png"
          alt=""
          width={512}
          height={1536}
          className="h-full w-auto"
        />
      </div>
      <div className="pointer-events-none absolute bottom-0 right-0 h-[70vh] w-auto translate-x-10 rotate-180 opacity-70">
        <Image
          src="/ornament.png"
          alt=""
          width={512}
          height={1536}
          className="h-full w-auto"
        />
      </div>
      <div className="relative mx-auto w-full max-w-6xl px-6 py-10">
        <AdminHeader login={payload.login} lang={adminLang} />
        <main className="mt-10">{children}</main>
      </div>
    </div>
  );
}
