import {
  Boxes,
  ClipboardList,
  Croissant,
  Settings,
  Truck,
  Users,
} from "lucide-react";
import Link from "next/link";

import { PageHeader } from "@/components/admin/layout";

const sections = [
  {
    href: "/admin/users",
    title: "Users",
    description: "Create staff accounts and assign roles.",
    icon: Users,
  },
  {
    href: "/admin/raw-materials",
    title: "Raw materials",
    description: "Define materials the store receives and tracks.",
    icon: Boxes,
  },
  {
    href: "/admin/products",
    title: "Products",
    description: "Define finished goods and their selling prices.",
    icon: Croissant,
  },
  {
    href: "/admin/suppliers",
    title: "Suppliers",
    description: "Maintain the list of material suppliers.",
    icon: Truck,
  },
  {
    href: "/admin/recipes",
    title: "Recipes",
    description: "Set the material formula for each product.",
    icon: ClipboardList,
  },
  {
    href: "/admin/settings",
    title: "Settings",
    description: "Units, expense categories, and approval rules.",
    icon: Settings,
  },
];

export default function AdminHomePage() {
  return (
    <>
      <PageHeader
        title="Admin"
        description="Define the master data the rest of the system depends on."
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sections.map((section) => {
          const Icon = section.icon;
          return (
            <Link
              className="rounded-md border border-stone-200 bg-white p-5 shadow-sm transition hover:border-red-300 hover:shadow"
              href={section.href}
              key={section.href}
            >
              <span className="grid size-10 place-items-center rounded-md bg-red-50 text-red-800">
                <Icon aria-hidden="true" className="size-5" />
              </span>
              <h2 className="mt-3 text-base font-semibold text-stone-950">
                {section.title}
              </h2>
              <p className="mt-1 text-sm text-stone-500">
                {section.description}
              </p>
            </Link>
          );
        })}
      </div>
    </>
  );
}
