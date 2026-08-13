export function BrandMark({ className = "" }: { className?: string }) {
  return (
    <svg className={`brand-mark ${className}`.trim()} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <rect width="64" height="64" rx="18" fill="#E8765A" />
      <circle cx="32" cy="32" r="17" fill="none" stroke="#FFFFFF" strokeWidth="8" />
      <circle cx="32" cy="32" r="4" fill="#153E32" />
    </svg>
  );
}
