import * as PopoverPrimitive from "@radix-ui/react-popover";

// Radix shares dismissal, focus restoration, portal positioning and cleanup.
export function Popover({
  trigger,
  children,
  label,
  open,
  onOpenChange,
  className = "",
}) {
  return (
    <PopoverPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <PopoverPrimitive.Trigger asChild>{trigger}</PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          aria-label={label}
          align="end"
          sideOffset={8}
          collisionPadding={12}
          className={`popover-content ${className}`}
        >
          {children}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
