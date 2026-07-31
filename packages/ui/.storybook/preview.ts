import type { Preview } from "@storybook/react-vite";
import "./preview.css";

const preview: Preview = {
  parameters: {
    layout: "centered",
    backgrounds: { default: "dark" },
  },
};

export default preview;
