import { createContext } from "react";
import type { Milestone } from "~/utils/milestones";

/** The dashboard's milestones, for every TrendChart below it to mark. */
export const MilestonesContext = createContext<readonly Milestone[]>([]);
