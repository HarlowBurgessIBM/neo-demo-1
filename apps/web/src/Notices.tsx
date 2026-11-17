interface NoticesProps {
  /** The export stamp the shown shifts or result were read against. Each field is null when it could not be rendered. */
  stamp: {
    exportedAtUtcMinute: string | null;
    exportedAtSiteLocal: string | null;
    siteTimeZone: string | null;
  };
}

/** The pilot notices. Shown on every view once the shifts are loaded. Values are displayed as the API sent them. */
export function Notices({ stamp }: NoticesProps) {
  const { exportedAtUtcMinute, exportedAtSiteLocal, siteTimeZone } = stamp;
  const exported =
    exportedAtUtcMinute === null || exportedAtSiteLocal === null || siteTimeZone === null
      ? "Roster export time unavailable."
      : `Roster exported ${exportedAtUtcMinute} UTC (${exportedAtSiteLocal} site time, ${siteTimeZone}).`;
  return (
    <aside aria-label="Pilot notices">
      <p>{exported}</p>
      <p>Checks use rostered shifts only.</p>
      <p>Pilot scope: CDU and HCU only; holdovers not assessed.</p>
    </aside>
  );
}
