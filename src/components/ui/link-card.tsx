import Link from "next/link";
import { Card } from "./card";

// The tappable menu-item card used on the Vocab and Activities landing
// pages: a title + description inside the standard Card, as a full-card link.
export function LinkCard({
  href,
  title,
  description,
}: {
  href: string;
  title: string;
  description: string;
}) {
  return (
    <Link href={href} className="block transition active:scale-[0.98]">
      <Card className="flex items-center justify-between gap-3">
        <div>
          <p className="font-heading font-extrabold">{title}</p>
          <p className="mt-0.5 text-sm text-text-muted">{description}</p>
        </div>
        <span className="shrink-0 text-xl text-text/40" aria-hidden>
          &rarr;
        </span>
      </Card>
    </Link>
  );
}
