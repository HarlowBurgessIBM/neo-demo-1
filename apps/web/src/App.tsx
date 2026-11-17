import { useEffect, useRef, useState } from "react";
import { getDevUsers, getShifts, postSwapCheck } from "./api";
import type { GetResult, SwapCheckResult } from "./api";
import type { DevUser, ForbiddenResponse, Identity, RefusedResponse, ShiftsResponse, SwapPick } from "./contract";
import { DevUserSwitcher } from "./DevUserSwitcher";
import { NotEvaluated } from "./NotEvaluated";
import { Notices } from "./Notices";
import { RefusalView } from "./RefusalView";
import { ShiftPicker } from "./ShiftPicker";

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

type View =
  | { kind: "picker"; message: string | undefined; focusGive: boolean }
  | { kind: "refused"; body: RefusedResponse }
  | { kind: "not-evaluated" };

function describeForbidden(code: ForbiddenResponse["code"]): string {
  switch (code) {
    case "give-shift-not-yours":
      return "You can only give one of your own shifts.";
    case "role-not-permitted":
      return "Your role is not permitted to check swaps.";
    case "not-a-roster-operator":
      return "You are not a rostered operator, so you cannot check swaps.";
  }
}

function viewFor(result: SwapCheckResult): View {
  switch (result.kind) {
    case "refused":
      return { kind: "refused", body: result.body };
    case "not-evaluated":
      return { kind: "not-evaluated" };
    case "forbidden":
      return { kind: "picker", message: describeForbidden(result.body.code), focusGive: false };
    case "unauthenticated":
      return { kind: "picker", message: "You are not signed in, so the swap could not be checked.", focusGive: false };
    case "error":
      return { kind: "picker", message: `Could not check the swap. ${result.message}`, focusGive: false };
  }
}

export function App() {
  // Read at render time so tests can stub it. In production the gateway supplies identity.
  const isProduction = import.meta.env.PROD;
  const [devUsers, setDevUsers] = useState<DevUser[]>([]);
  const [identity, setIdentity] = useState<Identity | undefined>(undefined);
  const [shifts, setShifts] = useState<ShiftsResponse | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [view, setView] = useState<View>({ kind: "picker", message: undefined, focusGive: false });
  const [checking, setChecking] = useState(false);
  const checkSequence = useRef(0);

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
    // Drop any check still in flight so its answer cannot land on the next user's picker.
    checkSequence.current += 1;
    setShifts(undefined);
    setError(undefined);
    setView({ kind: "picker", message: undefined, focusGive: false });
    setChecking(false);
    setIdentity(selected);
  }

  function handleChooseAgain() {
    // The button the user pressed is about to unmount, so hand focus to the first field.
    setView({ kind: "picker", message: undefined, focusGive: true });
  }

  function handleCheck(pick: SwapPick) {
    checkSequence.current += 1;
    const sequence = checkSequence.current;
    setChecking(true);
    void postSwapCheck(isProduction ? undefined : identity, pick).then((result) => {
      if (sequence !== checkSequence.current) return;
      setChecking(false);
      setView(viewFor(result));
    });
  }

  return (
    <main>
      <h1>ShiftSwap</h1>
      <p>Port Alder Refinery — shift swap requests.</p>
      {isProduction ? null : <DevUserSwitcher users={devUsers} onSelect={handleSelect} />}
      {error === undefined ? null : <p role="alert">{error}</p>}
      {shifts === undefined ? null : (
        <>
          <Notices shifts={shifts} />
          {/* Only the result is announced, never the form and its options. */}
          <div aria-live="polite">
            {view.kind === "refused" ? (
              <RefusalView refusal={view.body} onChooseAgain={handleChooseAgain} />
            ) : view.kind === "not-evaluated" ? (
              <NotEvaluated onChooseAgain={handleChooseAgain} />
            ) : null}
          </div>
          {view.kind === "picker" ? (
            <>
              {view.message === undefined ? null : <p role="alert">{view.message}</p>}
              <ShiftPicker
                give={shifts.give}
                take={shifts.take}
                onCheck={handleCheck}
                pending={checking}
                focusOnMount={view.focusGive}
              />
            </>
          ) : null}
        </>
      )}
    </main>
  );
}
