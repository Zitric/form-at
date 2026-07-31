import type { Meta, StoryObj } from "@storybook/react-vite";
import { Body, Heading, Label, Muted, PageTitle } from "./Text";

// Each story below renders a different member of the Text family via a
// custom `render`, so `meta` deliberately has no single `component` — tying
// StoryObj to one component's props would wrongly force every story to
// satisfy that component's args shape.
const meta = {
  title: "Text",
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const HeadingVariant: Story = {
  name: "Heading",
  render: () => <Heading>system_architects</Heading>,
};

export const LabelVariant: Story = {
  name: "Label",
  render: () => <Label>artist_name</Label>,
};

export const BodyVariant: Story = {
  name: "Body",
  render: () => <Body>Residents and guest DJs at Form:at, Glasgow's techno collective.</Body>,
};

export const MutedVariant: Story = {
  name: "Muted",
  render: () => <Muted>data may be incomplete before 2026</Muted>,
};

export const PageTitleStory: Story = {
  name: "PageTitle",
  render: () => <PageTitle>events</PageTitle>,
};
