import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { Shift, SwapPick, TakeShift } from "./contract";

interface ShiftPickerProps {
  give: Shift[];
  take: TakeShift[];
  onCheck: (pick: SwapPick) => void;
  /** True while a check is in flight. The button stays focusable but ignores presses. */
  pending: boolean;
  /** Move focus to the "Shift to give" select on mount. Off on first load so focus is not stolen. */
  focusOnMount: boolean;
}

function describeShift(shift: Shift): string {
  return `${shift.shiftId} · ${shift.unit} · ${shift.role} · ${shift.start}–${shift.end}`;
}

/** Chooses one shift to give and one to take. Every value shown is the API's own string. */
export function ShiftPicker({ give, take, onCheck, pending, focusOnMount }: ShiftPickerProps) {
  const [giveShiftId, setGiveShiftId] = useState("");
  const [takeShiftId, setTakeShiftId] = useState("");
  const giveSelectRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    if (focusOnMount) {
      giveSelectRef.current?.focus();
    }
  }, [focusOnMount]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || giveShiftId === "" || takeShiftId === "") {
      return;
    }
    onCheck({ giveShiftId, takeShiftId });
  }

  return (
    <form aria-labelledby="shift-picker-heading" onSubmit={handleSubmit}>
      <h2 id="shift-picker-heading">Choose the shifts to swap</h2>
      <div>
        <label htmlFor="shift-to-give">Shift to give</label>{" "}
        <select
          id="shift-to-give"
          ref={giveSelectRef}
          value={giveShiftId}
          onChange={(event) => {
            setGiveShiftId(event.target.value);
          }}
        >
          <option value="">Choose a shift to give</option>
          {give.map((shift) => (
            <option key={shift.shiftId} value={shift.shiftId}>
              {describeShift(shift)}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="shift-to-take">Shift to take</label>{" "}
        <select
          id="shift-to-take"
          value={takeShiftId}
          onChange={(event) => {
            setTakeShiftId(event.target.value);
          }}
        >
          <option value="">Choose a shift to take</option>
          {take.map((shift) => (
            <option key={shift.shiftId} value={shift.shiftId}>
              {`${describeShift(shift)} · held by ${shift.ownerName}`}
            </option>
          ))}
        </select>
      </div>
      <button type="submit" disabled={giveShiftId === "" || takeShiftId === ""} aria-disabled={pending}>
        Check swap
      </button>
    </form>
  );
}
