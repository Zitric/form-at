import type { Meta, StoryObj } from "@storybook/react-vite";
import { TerminalRow } from "./TerminalRow";

const meta = {
  title: "TerminalRow",
  component: TerminalRow,
} satisfies Meta<typeof TerminalRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { label: "total_plays", value: "1,204" },
};

export const Dimmed: Story = {
  name: "Dimmed value",
  args: { label: "excluded_plays", value: "12", dimValue: true },
};
