export type DJ = {
  id: string;
  name: string;
  type: "resident" | "guest";
  bio?: string;
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
    name: "Hubey",
    type: "resident",
    bio: "Co-founder of Form:at. Graphic designer and selector. Analog sound for a digital world.",
    setIds: ["signal-002-hubey"],
  },
  {
    id: "julz-lever",
    name: "Julz Lever",
    type: "resident",
    bio: "Co-founder of Form:at. Software engineer by day, techno selector by night.",
    setIds: ["signal-002-julz-lever"],
  },
  {
    id: "til",
    name: "t.i.l.",
    type: "resident",
    bio: "Resident selector at Form:at. Acid, dub and the frequencies in between.",
    setIds: ["signal-002-til"],
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
