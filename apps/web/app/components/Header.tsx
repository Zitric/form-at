import { Link } from "@tanstack/react-router";

export function Header() {
  return (
    <header className="mb-12">
      <Link to="/" className="inline-block opacity-60 hover:opacity-100 transition-opacity">
        <div className="overflow-hidden w-[310px] h-[44px]">
          <img
            src="/wordmark.png"
            alt="Form:at"
            className="w-[475px] -translate-x-[17.32%] -translate-y-[45.6%] mix-blend-screen"
          />
        </div>
      </Link>
    </header>
  );
}
