export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} role="img" aria-label="Grounds">
      <circle cx="24" cy="24" r="23" fill="#C0651E" />
      <path
        d="M24 8c7.2 0 13 5.8 13 13 0 8.4-6.6 14.6-13 19-6.4-4.4-13-10.6-13-19 0-7.2 5.8-13 13-13Z"
        fill="#3A2116"
        opacity=".18"
      />
      <path
        d="M15 31c3-9.5 9-15.5 18-18-1.2 9.8-6.4 16.2-15 19.4"
        fill="none"
        stroke="#F7EFE3"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <path d="M24 33c-.2-6 2-11 6.5-15" fill="none" stroke="#F7EFE3" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}
