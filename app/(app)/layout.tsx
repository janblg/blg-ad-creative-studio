import Link from "next/link";
import { requireContext } from "@/lib/auth";
import { signOut } from "@/app/login/actions";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, role } = await requireContext();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-line">
        <div className="mx-auto max-w-6xl px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/" className="font-bold tracking-tight">
              BLG Ad Studio
            </Link>
            <nav className="flex items-center gap-4 text-sm text-text-dim">
              <Link href="/" className="hover:text-text">
                Brands
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-text-dim">
              {user.email} · <span className="capitalize">{role}</span>
            </span>
            <form action={signOut}>
              <button className="rounded-md border border-line px-2 py-1 text-xs hover:bg-raised">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl px-4 py-8 flex-1">{children}</main>
    </div>
  );
}
