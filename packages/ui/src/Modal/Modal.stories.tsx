import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { Modal } from "./Modal";

const meta = {
  title: "Modal",
  component: Modal,
  args: { onClose: fn() },
} satisfies Meta<typeof Modal>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Open: Story = {
  args: {
    open: true,
    title: "save for offline?",
    ariaLabel: "Save for offline",
    children: <p className="text-sm text-grey">This set will be downloaded to your device.</p>,
  },
};

export const ClosedByCloseButton: Story = {
  name: "Dismiss via close button",
  args: { ...Open.args },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Close" }));
    await expect(args.onClose).toHaveBeenCalledOnce();
  },
};

export const ClosedByBackdrop: Story = {
  name: "Dismiss via backdrop click",
  args: { ...Open.args },
  play: async ({ canvasElement, args }) => {
    const dialog = canvasElement.querySelector("dialog");
    if (!dialog) throw new Error("dialog not found");
    await userEvent.click(dialog);
    await expect(args.onClose).toHaveBeenCalledOnce();
  },
};
