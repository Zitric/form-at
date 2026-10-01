import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { Button } from "./Button";

const meta = {
  title: "Button",
  component: Button,
  args: { onClick: fn() },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Secondary: Story = {
  args: { variant: "secondary", children: "save_for_offline" },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button"));
    await expect(args.onClick).toHaveBeenCalledOnce();
  },
};

export const Fail: Story = {
  args: { variant: "fail", children: "cancel_download" },
};

export const Primary: Story = {
  args: { variant: "primary", children: "play_set" },
};

export const Disabled: Story = {
  args: { variant: "secondary", children: "unavailable", disabled: true },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button"));
    await expect(args.onClick).not.toHaveBeenCalled();
  },
};
