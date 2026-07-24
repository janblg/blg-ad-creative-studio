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
      <header className="border-b border-neutral-200 dark:border-neutral-800">
        <div className="mx-auto max-w-6xl px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/" className="font-bold tracking-tight">
              BLG Ad Studio
            </Link>
            <nav className="flex items-center gap-4 text-sm text-neutral-600 dark:text-neutral-300">
              <Link href="/" className="hover:text-neutral-900 dark:hover:text-white">
                Brands
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-neutral-500">
              {user.email} · <span className="capitalize">{role}</span>
            </span>
            <form action={signOut}>
              <button className="rounded-md border border-neutral-300 dark:border-neutral-700 px-2 py-1 text-xs hover:bg-neutral-100 dark:hover:bg-neutral-900">
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
