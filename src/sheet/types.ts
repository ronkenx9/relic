import type { ArchetypeDef, SheetStats } from "../engine/archetype.js";
import type { Moment } from "../engine/moments.js";

export interface CharacterSheet {
  address: string;
  ageYears: number;
  heightTxs: number;
  affiliation: string;
  role: string;
  stats: SheetStats;
  personality: string;
  archetype: ArchetypeDef;
  evidence: string[];
  moments: Moment[];
  version: string;
}
