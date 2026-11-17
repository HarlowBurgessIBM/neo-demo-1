import { useState } from "react";
import type { FormEvent } from "react";
import type { Shift, SwapPick } from "./contract";

interface ShiftPickerProps {
  give: Shift[];
  take: Shift[];
  onCheck: (pick: SwapPick) => void;
}

function describeShift(shift: Shift): string {
  return `${shift.shiftId} · ${shift.unit} · ${shift.role} · ${shift.start}–${shift.end}`;
}

/** Chooses one shift to give and one to take. Every value shown is the API's own string. */
export function ShiftPicker({ give, take, onCheck }: ShiftPickerProps) {
  const [giveShiftId, setGiveShiftId] = useState("");
  const [takeShiftId, setTakeShiftId] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (giveShiftId === "" || takeShiftId === "") {
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
              {describeShift(shift)}
            </option>
          ))}
        </select>
      </div>
      <button type="submit" disabled={giveShiftId === "" || takeShiftId === ""}>
        Check swap
      </button>
    </form>
  );
}
