import { composeStories } from "@storybook/react-vite";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import * as stories from "./Text.stories";

const { HeadingVariant, PageTitleStory } = composeStories(stories);

describe("Text family", () => {
  it("Heading renders as an h2 by default", () => {
    render(<HeadingVariant />);
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("system_architects");
  });

  it("PageTitle renders as a heading with a gold marker prefix", () => {
    render(<PageTitleStory />);
    const heading = screen.getByRole("heading", { level: 2 });
    expect(heading).toHaveTextContent("›events");
  });
});
