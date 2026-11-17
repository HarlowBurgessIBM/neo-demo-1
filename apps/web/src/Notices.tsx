import type { ShiftsResponse } from "./contract";

interface NoticesProps {
  shifts: ShiftsResponse;
}

/** The pilot notices. Shown on every view once the shifts are loaded. Values are displayed as the API sent them. */
export function Notices({ shifts }: NoticesProps) {
  const exported = `Roster exported ${shifts.exportedAtUtcMinute} UTC (${shifts.exportedAtSiteLocal} site time, ${shifts.siteTimeZone}).`;
  return (
    <aside aria-label="Pilot notices">
      <p>{exported}</p>
      <p>Checks use rostered shifts only.</p>
      <p>Pilot scope: CDU and HCU only; holdovers not assessed.</p>
    </aside>
  );
}
