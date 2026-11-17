import { useEffect, useState } from "react";
import { getDevUsers, getShifts } from "./api";
import type { GetResult } from "./api";
import type { DevUser, Identity, ShiftsResponse } from "./contract";
import { DevUserSwitcher } from "./DevUserSwitcher";

function describeFailure(result: Exclude<GetResult<unknown>, { kind: "ok" }>, what: string): string {
  switch (result.kind) {
    case "unauthenticated":
      return `You are not signed in, so ${what} could not be loaded.`;
    case "forbidden":
      return `You are not permitted to see ${what}.`;
    case "error":
      return `Could not load ${what}. ${result.message}`;
  }
}

export function App() {
  // Read at render time so tests can stub it. In production the gateway supplies identity.
  const isProduction = import.meta.env.PROD;
  const [devUsers, setDevUsers] = useState<DevUser[]>([]);
  const [identity, setIdentity] = useState<Identity | undefined>(undefined);
  const [shifts, setShifts] = useState<ShiftsResponse | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (isProduction) {
      return;
    }
    let current = true;
    void getDevUsers().then((result) => {
      if (!current) return;
      if (result.kind === "ok") {
        setDevUsers(result.data.users);
      } else {
        setError(describeFailure(result, "the development users"));
      }
    });
    return () => {
      current = false;
    };
  }, [isProduction]);

  useEffect(() => {
    // Outside production nothing is requested until a user is chosen.
    if (!isProduction && identity === undefined) {
      return;
    }
    let current = true;
    void getShifts(isProduction ? undefined : identity).then((result) => {
      if (!current) return;
      if (result.kind === "ok") {
        setShifts(result.data);
      } else {
        setError(describeFailure(result, "your shifts"));
      }
    });
    return () => {
      current = false;
    };
  }, [isProduction, identity]);

  function handleSelect(selected: Identity | undefined) {
    setShifts(undefined);
    setError(undefined);
    setIdentity(selected);
  }

  return (
    <main>
      <h1>ShiftSwap</h1>
      <p>Port Alder Refinery — shift swap requests.</p>
      {isProduction ? null : <DevUserSwitcher users={devUsers} onSelect={handleSelect} />}
      {error === undefined ? null : <p role="alert">{error}</p>}
      {shifts === undefined ? null : (
        <p>
          {shifts.give.length} of your shifts and {shifts.take.length} shifts available to take.
        </p>
      )}
    </main>
  );
}
