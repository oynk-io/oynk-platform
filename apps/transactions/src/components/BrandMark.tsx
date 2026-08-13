export function BrandMark({ className = "" }: { className?: string }) {
  return (
    <svg className={`brand-mark ${className}`.trim()} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <circle cx="18" cy="29" r="13" fill="none" stroke="#E8765A" strokeWidth="6" />
      <path d="m34 21 10 11 11-13M44 32v18" fill="none" stroke="#E8765A" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
