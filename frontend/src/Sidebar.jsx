import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import Icon from "./Icon";
import { useAuth } from "./auth";

export function useMobileNavigation() {
  const [mobile, setMobile] = useState(
    () => window.matchMedia?.("(max-width: 959px)").matches || false,
  );
  useEffect(() => {
    const media = window.matchMedia?.("(max-width: 959px)");
    if (!media) return;
    const update = () => setMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return mobile;
}
export default function Sidebar({
  pages,
  icons,
  screen,
  onNavigate,
  collapsed,
  open,
  onOpenChange,
  onCollapse,
}) {
  const mobile = useMobileNavigation();
  const auth = useAuth();
  const content = (
    <>
      <div className="brand-row">
        <div className="brand">
          <span className="brand-mark">
            <Icon name="grid" />
          </span>
          <div>
            <span>RetailAtlas</span>
            <small>Retail analytics</small>
          </div>
        </div>
        {!mobile && (
          <button
            type="button"
            className="icon-button sidebar-collapse-toggle"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
            onClick={onCollapse}
          >
            <Icon name="menu" />
          </button>
        )}
      </div>
      <div className="sidebar-body" data-open="true">
        <p className="nav-label">Workspace</p>
        <nav aria-label="Main navigation">
          {pages.slice(0, -1).map((name, index) => (
            <button
              type="button"
              key={name}
              onClick={() => onNavigate(index)}
              aria-current={screen === index ? "page" : undefined}
              className={`nav-item ${screen === index ? "active" : ""}`}
              aria-label={name}
              title={collapsed && !mobile ? name : undefined}
            >
              <Icon name={icons[index]} />
              <span className="navigation-label">{name}</span>
              {collapsed && !mobile && (
                <span className="nav-tooltip" aria-hidden="true">
                  {name}
                </span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button
            type="button"
            className={`nav-item ${screen === pages.length - 1 ? "active" : ""}`}
            onClick={() => onNavigate(pages.length - 1)}
            aria-current={screen === pages.length - 1 ? "page" : undefined}
            aria-label="Account"
            title={collapsed && !mobile ? "Account" : undefined}
          >
            <Icon name="shield" />
            <span className="navigation-label">Account</span>
          </button>
          {(!collapsed || mobile) && (
            <p className="sidebar-identity">
              {auth?.user?.email || "Account workspace"}
            </p>
          )}
        </div>
      </div>
    </>
  );
  if (!mobile)
    return (
      <aside className="sidebar" data-collapsed={collapsed}>
        {content}
      </aside>
    );
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          className="icon-button mobile-nav-trigger"
          aria-label={open ? "Close navigation" : "Open navigation"}
        >
          <Icon name="menu" />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="drawer-overlay" />
        <Dialog.Content
          className="sidebar mobile-drawer"
          aria-describedby="navigation-description"
        >
          <Dialog.Title className="sr-only">Navigation</Dialog.Title>
          <Dialog.Description id="navigation-description" className="sr-only">
            Select an application page.
          </Dialog.Description>
          <Dialog.Close asChild>
            <button
              type="button"
              className="icon-button drawer-close"
              aria-label="Close navigation"
            >
              <Icon name="close" />
            </button>
          </Dialog.Close>
          {content}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
