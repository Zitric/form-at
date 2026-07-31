import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  DownloadIcon,
  InstallIcon,
  NextIcon,
  PauseIcon,
  PlayIcon,
  PrevIcon,
  SavedIcon,
  ShareIcon,
} from "./index";

const ICONS = {
  DownloadIcon,
  InstallIcon,
  NextIcon,
  PauseIcon,
  PlayIcon,
  PrevIcon,
  SavedIcon,
  ShareIcon,
};

const meta = {
  title: "Icons",
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const AllIcons: Story = {
  name: "All icons",
  render: () => (
    <div style={{ display: "flex", gap: 24, flexWrap: "wrap", color: "#c58538" }}>
      {Object.entries(ICONS).map(([name, Icon]) => (
        <div
          key={name}
          style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}
        >
          <Icon className="w-6 h-6" />
          <span style={{ fontSize: 10, color: "#cbcbcb" }}>{name}</span>
        </div>
      ))}
    </div>
  ),
};
