/** Shared artwork from the Oynk mobile launcher master. */
export function BrandMark({ className = "" }: { className?: string }) {
  return <img className={`brand-mark ${className}`.trim()} src="/icon-192.png" width="48" height="48" alt="" aria-hidden="true" draggable={false} />;
}
