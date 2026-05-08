export type DJ = {
  id: string;
  name: string;
  type: "resident" | "guest";
  bio?: string;
  /**
   * Base path under `/images/`, no size or extension — consumed by `<Image src={dj.photo}>`.
   * e.g. `"djs/julz-lever"` → resolves to the AVIF/WebP variants in `public/images/djs/`.
   * Source file goes in `apps/web/images-source/djs/{id}.jpg`; run `pnpm optimize-images` to generate.
   */
  photo?: string;
  socials?: {
    instagram?: string;
    soundcloud?: string;
  };
  setIds?: string[];
};

export const djs: DJ[] = [
  // Guests — promoted first
  {
    id: "angel-negrin",
    name: "Ángel Negrín",
    type: "guest",
    bio: "Canarian selector based in Glasgow. Techno, electro and everything in between.",
  },
  {
    id: "brandon-lee-vear",
    name: "Brandon Lee Vear",
    type: "guest",
    bio: "Glasgow-based DJ and producer. Deep, hypnotic techno with a raw edge.",
  },
  // Residents
  {
    id: "hubey",
    name: "hubey",
    type: "resident",
    bio: "With a house head and an acid heart, hubey has been dishing out bangers around Glasgow, playing with Luna Roja, OH parties and, of course, as a resident at Form:at. Further afield, she can be found in her home town of Dumfries, and has played at the excellent Eden Festival. Expect house, electro, techno... and a wavey adventure to all the places in between.",
    photo: "djs/hubey",
    setIds: ["set-002-hubey"],
  },
  {
    id: "julz-lever",
    name: "Julz Lever",
    type: "resident",
    bio: "Co-founder of Form:at. Software engineer by day, techno selector by night.",
    photo: "djs/julz-lever",
    setIds: ["set-002-julz-lever"],
  },
  {
    id: "til",
    name: "t.i.l.",
    type: "resident",
    bio: "Resident selector at Form:at. Acid, dub and the frequencies in between.",
    photo: "djs/til",
    setIds: ["set-002-til"],
  },
];

export function getDJ(id: string): DJ | undefined {
  return djs.find((d) => d.id === id);
}

export function getResidents(): DJ[] {
  return djs.filter((d) => d.type === "resident");
}

export function getGuests(): DJ[] {
  return djs.filter((d) => d.type === "guest");
}
