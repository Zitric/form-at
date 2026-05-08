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
  // Guests
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
    bio: "Brandon Lee Vear is an Australian born poet and musician based in Glasgow. As a resident of local artist run space EXIT club, Brandon’s sound is defined by the outer edges of hypnotic and psychedelic techno, electro and experimental. Coming from a background in the DIY punk scene in Chicago, counter culture and independence are central to his artistry. Sharing line-ups with the likes of Rrose, Stanislav Tolkachev and Marco Shuttle, he has become a key figure in Scotland’s experimental scene.",
  },

  // Residents
  {
    id: "til",
    name: "t.i.l.",
    type: "resident",
    bio: "Resident selector at Form:at. Acid, dub and the frequencies in between.",
    photo: "djs/til",
    setIds: ["set-002-til"],
  },
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
