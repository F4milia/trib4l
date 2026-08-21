"use client";

import { useRouter } from "next/navigation";

type OrgOption = { slug: string; name: string };

export function OrgSwitcher({ current, orgs }: { current: string; orgs: OrgOption[] }) {
  const router = useRouter();

  return (
    <label>
      Community:{" "}
      <select
        defaultValue={current}
        onChange={(e) => router.push(`/o/${e.target.value}`)}
      >
        {orgs.map((org) => (
          <option key={org.slug} value={org.slug}>
            {org.name}
          </option>
        ))}
      </select>
    </label>
  );
}
