import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { Card } from "./Card";

const meta = {
  title: "Card",
  component: Card,
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

const PlaceholderImage = <div style={{ width: "100%", height: "100%", background: "#43437a" }} />;

export const Default: Story = {
  args: { primary: "Form:at 002", secondary: "Julz Lever" },
};

export const Cta: Story = {
  args: { primary: "Next event", secondary: "Form:at 003 — 12 Dec", variant: "cta" },
};

export const WithImage: Story = {
  name: "With image slot",
  args: { primary: "Julz Lever", image: PlaceholderImage },
};

export const WithAction: Story = {
  name: "With action node (renders as div[role=button])",
  args: {
    primary: "Form:at 002",
    onClick: fn(),
    action: <button type="button">[ play ]</button>,
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const buttons = canvas.getAllByRole("button");
    const outerCard = buttons.find((b) => b.tagName !== "BUTTON");
    if (!outerCard) throw new Error("outer card wrapper not found");
    await userEvent.click(outerCard);
    await expect(args.onClick).toHaveBeenCalled();
  },
};

export const Clickable: Story = {
  name: "Clickable, no action (renders as native <button>)",
  args: { primary: "Form:at 002", onClick: fn() },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const card = canvas.getByRole("button");
    expect(card.tagName).toBe("BUTTON");
    await userEvent.click(card);
    await expect(args.onClick).toHaveBeenCalledOnce();
  },
};
