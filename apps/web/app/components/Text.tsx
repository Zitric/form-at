import { cva } from "class-variance-authority";
import type { VariantProps } from "class-variance-authority";
import type React from "react";
import { cn } from "~/utils/cn";

type As = "p" | "span" | "div" | "li" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6";

const textVariants = cva("", {
  variants: {
    variant: {
      heading:
        "font-display text-white text-[1.375rem] leading-[1.75rem] sm:text-[1.625rem] sm:leading-[2rem]",
      label: "t-label sm:t-label-md",
      body: "t-body sm:t-body-md",
      muted: "t-muted sm:t-muted-md",
    },
  },
});

type TextVariantProps = VariantProps<typeof textVariants>;

interface TextProps extends TextVariantProps {
  children: React.ReactNode;
  className?: string;
  as?: As;
}

export function Text({ variant, children, className, as: Tag = "p" }: TextProps) {
  return <Tag className={cn(textVariants({ variant }), className)}>{children}</Tag>;
}

export function Heading({ children, className, as = "h2" }: Omit<TextProps, "variant">) {
  return (
    <Text variant="heading" as={as} className={className}>
      {children}
    </Text>
  );
}

export function Label({ children, className, as }: Omit<TextProps, "variant">) {
  return (
    <Text variant="label" as={as} className={className}>
      {children}
    </Text>
  );
}

export function Body({ children, className, as }: Omit<TextProps, "variant">) {
  return (
    <Text variant="body" as={as} className={className}>
      {children}
    </Text>
  );
}

export function Muted({ children, className, as }: Omit<TextProps, "variant">) {
  return (
    <Text variant="muted" as={as} className={className}>
      {children}
    </Text>
  );
}

export function PageTitle({ children, className, as }: Omit<TextProps, "variant">) {
  return (
    <Heading as={as} className={cn("font-display mb-6 text-grey", className)}>
      <span className="text-gold mr-1">›</span>
      {/* <span className="animate-blink text-gold! mr-2">{">"}</span> */}

      {children}
    </Heading>
  );
}
