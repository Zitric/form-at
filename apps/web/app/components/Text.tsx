import { cva } from "class-variance-authority";
import type { VariantProps } from "class-variance-authority";
import type React from "react";
import { cn } from "~/utils/cn";

type As = "p" | "span" | "div" | "li";

const textVariants = cva("", {
  variants: {
    variant: {
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
