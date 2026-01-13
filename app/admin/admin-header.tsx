"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import LogoutButton from "./logout-button";
import { useAdminLang } from "./use-admin-lang";
import OrderNotifications from "./order-notifications";

type AdminHeaderProps = {
  login: string;
  lang?: "ru" | "uz";
};

const navItems = [
  { labelRu: "Главная", labelUz: "Bosh sahifa", href: "/admin", exact: true },
  {
    labelRu: "Заведения",
    labelUz: "Muassasalar",
    href: "/admin/restaurants",
  },
  { labelRu: "Товары", labelUz: "Mahsulotlar", href: "/admin/products" },
  { labelRu: "Цены", labelUz: "Narxlar", href: "/admin/prices" },
  { labelRu: "Клиенты", labelUz: "Mijozlar", href: "/admin/clients" },
  {
    labelRu: "Сотрудники",
    labelUz: "Xodimlar",
    href: "/admin/employees",
  },
  { labelRu: "Заказы", labelUz: "Buyurtmalar", href: "/admin/orders" },
  {
    labelRu: "Интеграции",
    labelUz: "Integratsiyalar",
    href: "/admin/integrations",
  },
];

export default function AdminHeader({ login, lang }: AdminHeaderProps) {
  const pathname = usePathname();
  const { t } = useAdminLang(lang ?? "ru");

  return (
    <header className="sticky top-4 z-20 flex items-center rounded-2xl border border-white/40 bg-white/15 px-6 py-4 text-white shadow-[0_10px_30px_rgba(0,0,0,0.15)] backdrop-blur-md">
      <div className="flex items-center gap-4">
        <Image
          src="/logo.png"
          alt="Muhtasham"
          width={96}
          height={96}
          className="h-10 w-auto"
        />
      </div>
      <nav className="ml-15 flex items-center gap-6 text-sm text-white/85">
        {navItems.map((item) => {
          const isActive = item.exact
            ? pathname === item.href
            : item.href !== "#" && pathname.startsWith(item.href);
          const content = (
            <span
              className={`relative pb-1 transition-colors duration-300 ${
                isActive ? "text-white font-semibold" : "hover:text-white"
              }`}
            >
              {t(item.labelRu, item.labelUz)}
              <span
                className={`absolute left-0 right-0 -bottom-1 h-0.5 origin-left bg-white transition-transform duration-300 ${
                  isActive ? "scale-x-100" : "scale-x-0"
                }`}
              />
            </span>
          );

          if (item.href === "#") {
            return (
              <button key={item.labelRu} type="button">
                {content}
              </button>
            );
          }

          return (
            <Link key={item.labelRu} href={item.href}>
              {content}
            </Link>
          );
        })}
      </nav>
      <div className="ml-auto flex items-center gap-3 text-sm text-white">
        <OrderNotifications lang={lang} />
        <span className="font-semibold">{login}</span>
        <LogoutButton />
      </div>
    </header>
  );
}
