export function BrandTitle({ children }: { children: string }) {
  const parts = children.split(":");
  if (parts.length === 1) return <>{children}</>;
  return (
    <>
      {parts.map((part, i) => (
        <span key={part}>
          {part}
          {i < parts.length - 1 && <span className="animate-blink">:</span>}
        </span>
      ))}
    </>
  );
}
