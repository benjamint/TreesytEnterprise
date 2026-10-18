import type { LucideIcon } from 'lucide-react';
import { ClipboardCheck, GraduationCap, HandHeart, Map, MapPinned, PiggyBank, RotateCcw, ShoppingBasket, Trees, UserPlus, UsersRound, Warehouse } from 'lucide-react';
import type { ModuleKey } from '@/types';
import type { MobileFlow } from '@/app/routes';

/** Record (+) tiles: shown when the agent type allows them and the company module is on. */
export const TILES: { key: string; icon: LucideIcon; flow: MobileFlow; module: ModuleKey }[] = [
  { key: 'profiling', icon: MapPinned, flow: 'M3', module: 'farmers' },
  { key: 'farmers', icon: UserPlus, flow: 'M4', module: 'farmers' },
  { key: 'groups', icon: UsersRound, flow: 'M4', module: 'farmers' },
  { key: 'buying', icon: ShoppingBasket, flow: 'M5', module: 'buying' },
  { key: 'support', icon: HandHeart, flow: 'M6', module: 'support' },
  { key: 'recovery', icon: RotateCcw, flow: 'M7', module: 'recovery' },
  { key: 'warehouse', icon: Warehouse, flow: 'M8', module: 'inventory' },
  { key: 'trees', icon: Trees, flow: 'M9', module: 'trees' },
  { key: 'plots', icon: Map, flow: 'M9', module: 'plots' },
  { key: 'surveys', icon: ClipboardCheck, flow: 'M10', module: 'forms' },
  { key: 'workshops', icon: GraduationCap, flow: 'M10', module: 'workshops' },
  { key: 'budget', icon: PiggyBank, flow: 'M11', module: 'weeklyBudgets' },
];
