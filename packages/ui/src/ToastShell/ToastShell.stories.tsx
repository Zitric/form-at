import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { ToastShell } from "./ToastShell";

const meta = {
  title: "ToastShell",
  component: ToastShell,
  args: { onClick: fn() },
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof ToastShell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    variant: "default",
    ariaLabel: "Dismiss notification",
    children: <span className="text-grey">copied to clipboard</span>,
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Dismiss notification" }));
    await expect(args.onClick).toHaveBeenCalledOnce();
  },
};

export const ErrorVariant: Story = {
  name: "Error (role=alert)",
  args: {
    variant: "error",
    role: "alert",
    ariaLabel: "Dismiss playback error",
    children: <span>playback error</span>,
  },
};
