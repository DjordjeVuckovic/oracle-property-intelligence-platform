import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_.arrow]:transition-transform hover:[&_.arrow]:translate-x-0.5",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        outline: "border border-border bg-transparent hover:bg-secondary",
        ghost: "hover:bg-secondary",
        ink: "bg-ink text-white hover:bg-ink/90",
      },
      size: {
        sm: "h-8 px-4 text-sm",
        default: "h-10 px-6 text-sm",
        lg: "h-12 px-8 text-base",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  arrow?: boolean;
}

function Button({ className, variant, size, arrow, children, ...props }: ButtonProps) {
  return (
    <button className={cn(buttonVariants({ variant, size }), className)} {...props}>
      {children}
      {arrow ? <span className="arrow" aria-hidden>&rarr;</span> : null}
    </button>
  );
}

export { Button, buttonVariants };
