"use client";

import { useRouter } from "next/navigation";

type OrgOption = { slug: string; name: string };

export function OrgSwitcher({ current, orgs }: { current: string; orgs: OrgOption[] }) {
  const router = useRouter();

  return (
    <select
      defaultValue={current}
      onChange={(e) => router.push(`/o/${e.target.value}`)}
      className="rounded-md border border-white/30 bg-primary-dark px-3 py-1.5 text-sm text-white focus:border-accent focus:outline-none"
    >
      {orgs.map((org) => (
        <option key={org.slug} value={org.slug} className="text-ink">
          {org.name}
        </option>
      ))}
    </select>
  );
}
