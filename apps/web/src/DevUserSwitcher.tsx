import type { DevUser, Identity } from "./contract";

interface DevUserSwitcherProps {
  users: DevUser[];
  /** The selected user's identity, or undefined when the empty option is chosen. */
  onSelect: (identity: Identity | undefined) => void;
}

/** Development-only control for choosing who the app acts as. Never rendered in production. */
export function DevUserSwitcher({ users, onSelect }: DevUserSwitcherProps) {
  return (
    <div>
      <label htmlFor="dev-user-switcher">Act as (development only)</label>{" "}
      <select
        id="dev-user-switcher"
        defaultValue=""
        onChange={(event) => {
          const user = users.find((candidate) => candidate.employeeNumber === event.target.value);
          onSelect(user === undefined ? undefined : { employeeNumber: user.employeeNumber, roles: user.roles });
        }}
      >
        <option value="">Choose a user</option>
        {users.map((user) => (
          <option key={user.employeeNumber} value={user.employeeNumber}>
            {user.name} ({user.employeeNumber})
          </option>
        ))}
      </select>
    </div>
  );
}
