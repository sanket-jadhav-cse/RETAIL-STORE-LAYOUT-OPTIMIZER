import { useState } from "react";
import { useAuth } from "./auth";
import { Popover } from "./overlays";
import { Notice } from "./ui";

export function UserMenu({ onAccount }) {
  const auth = useAuth();
  const [open, setOpen] = useState(false),
    [error, setError] = useState("");
  if (!auth?.user) return null;
  const name = auth.user.user_metadata?.display_name || auth.user.email;
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      label="Account menu"
      trigger={
        <button
          className="icon-button account-avatar"
          type="button"
          aria-label="Open account menu"
          title={name}
        >
          {name?.slice(0, 1).toUpperCase() || "●"}
        </button>
      }
    >
      <p className="account-name">{name}</p>
      <p className="muted account-email">{auth.user.email}</p>
      {error && <Notice kind="error">{error}</Notice>}
      <button
        type="button"
        className="button secondary"
        onClick={() => {
          setOpen(false);
          onAccount();
        }}
      >
        Profile settings and account information
      </button>
      <button
        type="button"
        className="button secondary"
        onClick={async () => {
          const result = await auth.signOut();
          if (result.error) setError("Sign out failed. Please retry.");
        }}
      >
        Sign out
      </button>
    </Popover>
  );
}
