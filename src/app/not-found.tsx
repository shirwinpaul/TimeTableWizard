import Link from "next/link";
import { EmptyState } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl p-10">
      <EmptyState title="Page not found" action={<Link href="/" className="font-semibold text-primary underline">Go home</Link>}>
        That page doesn&apos;t exist. Even wizards get lost sometimes.
      </EmptyState>
    </div>
  );
}
