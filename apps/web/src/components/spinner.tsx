/**
 * Circular busy indicator for action buttons. Inherits the button's text
 * color via border-current, so it reads white on burgundy buttons and
 * dark on secondary ones.
 */
export function Spinner({ className = "size-4" }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
    />
  );
}
