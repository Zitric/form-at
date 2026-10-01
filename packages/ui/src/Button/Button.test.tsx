import { composeStories } from "@storybook/react-vite";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import * as stories from "./Button.stories";

const { Secondary, Emphasis, Fail, Primary, Disabled } = composeStories(stories);

beforeEach(() => {
  Secondary.args.onClick?.mockClear();
  Emphasis.args.onClick?.mockClear();
  Disabled.args.onClick?.mockClear();
});

describe("Button", () => {
  it("secondary variant wraps its label in gold brackets", () => {
    render(<Secondary />);
    expect(screen.getByText("[")).toHaveClass("text-gold");
  });

  it("emphasis variant has a gold label as well as gold brackets", () => {
    render(<Emphasis />);
    expect(screen.getByText("[")).toHaveClass("text-gold");
    expect(screen.getByRole("button")).toHaveClass("text-gold");
  });

  it("secondary keeps a grey label, so emphasis is the only gold one", () => {
    render(<Secondary />);
    expect(screen.getByRole("button")).toHaveClass("text-grey");
  });

  it("emphasis fires onClick when clicked", async () => {
    render(<Emphasis />);
    await userEvent.setup().click(screen.getByRole("button"));
    expect(Emphasis.args.onClick).toHaveBeenCalledTimes(1);
  });

  it("fail variant wraps its label in red brackets", () => {
    render(<Fail />);
    expect(screen.getByText("[")).toHaveClass("text-red-400");
  });

  it("primary variant renders children raw, with no brackets", () => {
    render(<Primary />);
    expect(screen.queryByText("[")).not.toBeInTheDocument();
    expect(screen.getByText("play_set")).toBeInTheDocument();
  });

  it("fires onClick when clicked", async () => {
    render(<Secondary />);
    await userEvent.setup().click(screen.getByRole("button"));
    expect(Secondary.args.onClick).toHaveBeenCalledTimes(1);
  });

  it("does not fire onClick when disabled", async () => {
    render(<Disabled />);
    await userEvent.setup().click(screen.getByRole("button"));
    expect(Disabled.args.onClick).not.toHaveBeenCalled();
  });
});
