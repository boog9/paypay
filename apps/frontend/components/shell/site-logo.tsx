import Link from "next/link";

export function SiteLogo({ className = "" }: { className?: string }) {
  return (
    <Link
      href="/"
      aria-label="PayPay Portal home"
      className={`flex items-center gap-2 px-2 py-2 text-xl font-semibold leading-none select-none ${className}`}
    >
      <span>PayPay Portal</span>
    </Link>
  );
}

export default SiteLogo;
