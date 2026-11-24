interface Props {
  size?: number;
  className?: string;
}

export default function BrandMark({ size = 36, className = '' }: Props) {
  return (
    <span
      className={`brand-mark ${className}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 40 40" fill="none">
        <path d="M8 25.5h6.2l3.6-11 5.1 17 3.8-11H32" stroke="currentColor" strokeWidth="2.7" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="8" cy="25.5" r="2" fill="currentColor" />
        <circle cx="32" cy="20.5" r="2" fill="currentColor" />
      </svg>
    </span>
  );
}
