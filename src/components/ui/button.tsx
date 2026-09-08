import Link from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "secondary";

const base =
  "inline-flex items-center justify-center gap-2 rounded-btn px-6 py-3.5 font-heading font-extrabold tracking-tight transition active:scale-95 disabled:opacity-50 disabled:pointer-events-none disabled:active:scale-100";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-text text-surface hover:bg-text/90",
  secondary: "border-2 border-text bg-surface text-text hover:bg-background",
};

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
};

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonProps) {
  return (
    <button
      className={`${base} ${variants[variant]} ${className}`}
      {...props}
    />
  );
}

type ButtonLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
  variant?: ButtonVariant;
};

export function ButtonLink({
  variant = "primary",
  className = "",
  href,
  ...props
}: ButtonLinkProps) {
  return (
    <Link
      href={href}
      className={`${base} ${variants[variant]} ${className}`}
      {...props}
    />
  );
}
