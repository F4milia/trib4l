"use client";

import { useRouter } from "next/navigation";
import { Select } from "@/components/ui";

type OrgOption = { slug: string; name: string };

/**
 * Uses the Select primitive so it picks up §7.2's drawn treatment and the
 * chevron, rather than carrying its own border and fill.
 */
export function OrgSwitcher({ current, orgs }: { current: string; orgs: OrgOption[] }) {
  const router = useRouter();

  return (
    <Select defaultValue={current} onChange={(e) => router.push(`/o/${e.target.value}`)}>
      {orgs.map((org) => (
        <option key={org.slug} value={org.slug}>
          {org.name}
        </option>
      ))}
    </Select>
  );
}
