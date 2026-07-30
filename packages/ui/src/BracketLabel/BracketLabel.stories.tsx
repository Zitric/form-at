import type { Meta, StoryObj } from "@storybook/react-vite";
import { BracketLabel } from "./BracketLabel";

const meta = {
  title: "BracketLabel",
  component: BracketLabel,
  parameters: {
    docs: {
      description: {
        component:
          "Form:at's terminal-bracket idiom: `[ label ]` in gold (CTA/status) or red (failure/destructive). Owns its own `whitespace-nowrap` so the bracket pair can never split across a line wrap.",
      },
    },
  },
} satisfies Meta<typeof BracketLabel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Gold: Story = {
  args: { tone: "gold", children: "update" },
};

export const Red: Story = {
  args: { tone: "red", children: "retry" },
};

export const NeverWrapsMidBracket: Story = {
  name: "Never wraps mid-bracket (narrow viewport)",
  args: { tone: "gold", children: "save_for_offline" },
  parameters: {
    docs: {
      description: {
        story:
          "Regression guard for a bug that shipped twice in production (Phase 2 banner, Phase 3 share/save row): at narrow widths the label must stay glued to its brackets on one line, never orphaning `]` on the next.",
      },
    },
  },
  decorators: [
    (Story) => (
      <div style={{ width: 100, border: "1px dashed #43437a", padding: 8 }}>
        <Story />
      </div>
    ),
  ],
};
