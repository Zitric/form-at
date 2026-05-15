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
  /**
   * External presence — store just the handle/slug (no full URL). The URL
   * builder in ~/utils/socials.ts wraps each into the canonical link.
   * For `website`, store the full URL since there's no canonical host pattern.
   */
  socials?: {
    instagram?: string;
    soundcloud?: string;
    mixcloud?: string;
    facebook?: string;
    residentadvisor?: string;
    bandcamp?: string;
    spotify?: string;
    linktree?: string;
    website?: string;
  };
  setIds?: string[];
};

export const djs: DJ[] = [
  // Residents
  {
    id: "julz-lever",
    name: "Julz Lever",
    type: "resident",
    bio: "A DJ and selector since 2004, Julz Lever cut his teeth on Technics turntables across the Spanish club circuit before bringing his raw, hypnotic techno vision to Scotland. Today, he is a central figure in Glasgow's underground architecture as the co-founder and resident of Form:at. A former resident of Edinburgh's Bailando Collective and co-founder of Circuit Control, Julz has left his mark on iconic venues like The Flying Duck and The Poetry Club. Heavily influenced by the hypnotic precision of Rene Wise, Rrose, Border One, Dasha Rush and many more... His sets are built on deep, driving, and uncompromising frequencies.",
    photo: "djs/julz-lever",
    setIds: ["set-002-julz-lever"],
    socials: { soundcloud: "julz-lever", residentadvisor: "julzlever", linktree: "julzlever" },
  },

  {
    id: "hubey",
    name: "hubey",
    type: "resident",
    bio: "With a house head and an acid heart, hubey has been dishing out bangers around Glasgow, playing with Luna Roja, OH parties and, of course, as a resident at Form:at. Further afield, she can be found in her home town of Dumfries, and has played at the excellent Eden Festival. Expect house, electro, techno... and a wavey adventure to all the places in between.",
    photo: "djs/hubey",
    setIds: ["set-002-hubey"],
    socials: {
      soundcloud: "hubeyyy",
      instagram: "_hubey__",
      residentadvisor: "hubey",
    },
  },
  {
    id: "til",
    name: "t.i.l.",
    type: "resident",
    bio: "Newly integrated into the Glasgow network, Valdas is a selector whose focus lies in precise curation. Transitioning from radio transmissions to live operations, he made his foundational debut at Form:at 002. A rising operator within the local architecture.",
    photo: "djs/til",
    setIds: ["set-002-til"],
  },

  // Guests
  {
    id: "angel-negrin",
    name: "Ángel Negrín",
    type: "guest",
    bio: "Ángel Negrín is a Venezuelan DJ based in Glasgow. After years of playing in psychedelic, punk and post-rock bands, his focus shifted to selecting and mixing music following his experiences in the rave scenes of Belgium and Scotland. He runs the Luna Roja parties, focused on psychedelic and hypnotic sounds.",
    photo: "djs/angel-negrin",
    socials: {
      soundcloud: "angelnegrin",
      instagram: "angelnegrin",
      residentadvisor: "angelnegrin",
    },
  },
  {
    id: "brandon-lee-vear",
    name: "Brandon Lee Vear",
    type: "guest",
    bio: "Brandon Lee Vear is an Australian born poet and musician based in Glasgow. As a resident of local artist run space EXIT club, Brandon’s sound is defined by the outer edges of hypnotic and psychedelic techno, electro and experimental. Coming from a background in the DIY punk scene in Chicago, counter culture and independence are central to his artistry. Sharing line-ups with the likes of Rrose, Stanislav Tolkachev and Marco Shuttle, he has become a key figure in Scotland’s experimental scene.",
    photo: "djs/brandon-lee-vear",
    socials: {
      soundcloud: "brandonleevear",
      instagram: "brandonleevear",
      residentadvisor: "brandonleevear",
      linktree: "brandonleevear",
    },
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
