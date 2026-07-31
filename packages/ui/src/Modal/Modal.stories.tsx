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
    // `findByRole` (polling), not `getByRole` (one synchronous check) — the
    // dialog's `showModal()` call happens in a `useEffect` (Modal.tsx), one
    // tick after React's initial commit. A synchronous query run as the
    // play function's first statement can race that effect and see the
    // still-closed (`display: none`) dialog, which drops the whole subtree
    // out of the accessibility tree ("no accessible roles" — reproduced
    // locally, 100% of the time, via a direct real-browser run against the
    // built Storybook static output). `findByRole` retries until the effect
    // has caught up.
    await userEvent.click(await canvas.findByRole("button", { name: "Close" }));
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
