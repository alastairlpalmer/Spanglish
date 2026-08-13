import type { ConceptSlug } from './concepts';

export type SessionType = 'cards' | 'read' | 'talk' | 'grammar' | 'input' | 'tutor';
export type CardDirection = 'recognition' | 'production';
export type CardSource = 'generated' | 'mined' | 'drill';
export type TargetKind = 'booked' | 'intended';
export type Level = 'A0' | 'A1' | 'A2' | 'B1' | 'B2';

export interface TargetHistoryEntry {
  from: string | null; // ISO date
  to: string | null;
  at: string; // ISO timestamp
}

export interface Profile {
  user_id: string;
  level: Level;
  dialect: string;
  country: string | null;
  started_at: string;
  target_date: string | null;
  target_kind: TargetKind | null;
  target_history: TargetHistoryEntry[];
  daily_minutes: number;
  quiet_mode: boolean;
  text_size: number;
  onboarded: boolean;
  converted_prompt_shown: boolean;
  updated_at: string;
}

export interface Session {
  id: string;
  user_id: string;
  type: SessionType;
  minutes: number;
  is_bonus: boolean;
  at: string;
  updated_at: string;
}

export interface Card {
  id: string;
  user_id: string;
  direction: CardDirection;
  es: string | null;
  en: string | null;
  word: string | null;
  word_en: string | null;
  note: string | null;
  prompt: string | null;
  answer: string | null;
  accepts: string[] | null;
  concept: ConceptSlug | null;
  source: CardSource;
  step: number;
  due: string;
  seen: number;
  deleted_at: string | null;
  updated_at: string;
}

export interface ErrorConcept {
  user_id: string;
  concept: ConceptSlug;
  count: number;
  clean_runs: number;
  first_seen: string | null;
  last_seen: string | null;
  updated_at: string;
}

export interface ErrorExample {
  id: string;
  user_id: string;
  concept: ConceptSlug;
  wrong: string | null;
  right_: string | null;
  why: string | null;
  at: string;
  updated_at: string;
}

export type PlanBlockType = 'cards' | 'talk' | 'drill' | 'read';

export interface PlanBlock {
  type: PlanBlockType;
  label: string;
  minutes: number;
}

export interface Plan {
  user_id: string;
  date: string; // YYYY-MM-DD local
  blocks: PlanBlock[];
  completed_at: string | null;
  bonus_minutes: number;
  updated_at: string;
}
