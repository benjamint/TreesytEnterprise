import type { LucideIcon } from 'lucide-react';
import {
  AlignLeft, AtSign, Calculator, Calendar, CalendarClock, CalendarDays, CheckSquare, CircleDot, Clock, Contact, Fingerprint, FileUp, Gauge, Grid3x3,
  Hash, Image, ListOrdered, MapPin, Mic, Nfc, PenLine, Phone, Hexagon, QrCode, Repeat, Search, Smile, Star, StickyNote, Tag, Text, ToggleLeft, Video, Wallet, Waypoints, Sigma, ListTree,
} from 'lucide-react';
import type { Option, Question, QuestionType } from '@/engines/forms';
import { questionKey } from '@/engines/forms';

export const TYPE_ICON: Record<QuestionType, LucideIcon> = {
  shortText: Text, longText: AlignLeft, number: Hash, decimal: Sigma, currency: Wallet, selectOne: CircleDot, selectMany: CheckSquare, yesNo: ToggleLeft,
  ranking: ListOrdered, rating: Star, likert: Gauge, nps: Smile, date: Calendar, time: Clock, dateTime: CalendarClock, monthYear: CalendarDays, year: CalendarDays,
  image: Image, audio: Mic, video: Video, file: FileUp, signature: PenLine, gpsPoint: MapPin, gpsPolygon: Hexagon, scanCode: QrCode, nfcTap: Nfc,
  thumbprint: Fingerprint, autoId: Tag, contact: Contact, email: AtSign, phone: Phone, recordPicker: Search, locationPicker: Waypoints, calculated: Calculator,
  note: StickyNote, repeatGroup: Repeat, table: Grid3x3,
};

export const PALETTE: { key: string; icon: LucideIcon; types: QuestionType[] }[] = [
  { key: 'text', icon: Text, types: ['shortText', 'longText', 'number', 'decimal', 'currency', 'email', 'phone'] },
  { key: 'choice', icon: CircleDot, types: ['selectOne', 'selectMany', 'yesNo', 'ranking'] },
  { key: 'scales', icon: Star, types: ['rating', 'likert', 'nps'] },
  { key: 'dates', icon: Calendar, types: ['date', 'time', 'dateTime', 'monthYear', 'year'] },
  { key: 'media', icon: Image, types: ['image', 'audio', 'video', 'file', 'signature', 'scanCode', 'nfcTap', 'thumbprint'] },
  { key: 'location', icon: MapPin, types: ['gpsPoint', 'gpsPolygon', 'locationPicker'] },
  { key: 'records', icon: ListTree, types: ['recordPicker', 'contact', 'autoId', 'calculated', 'note', 'repeatGroup', 'table'] },
];

const o = (value: string, en: string, fr: string): Option => ({ value, label: { en, fr } });

/** A new question of a type, with sensible starting settings. */
export function newQuestion(type: QuestionType, taken: Set<string>, label: { en: string; fr: string }, mapsTo: boolean): Question {
  const id = questionKey(label.en, taken);
  const q: Question = { id, type, label: { en: label.en, fr: label.fr } };
  if (mapsTo && !['note', 'calculated', 'autoId'].includes(type)) q.mapsTo = `customFields.${id}`;
  if (['selectOne', 'selectMany', 'ranking'].includes(type)) q.options = [o('option1', 'Option 1', 'Option 1'), o('option2', 'Option 2', 'Option 2')];
  if (type === 'rating') q.scale = { max: 5, style: 'stars' };
  if (type === 'likert') q.scale = { max: 5, low: { en: 'Disagree', fr: 'Pas d’accord' }, high: { en: 'Agree', fr: 'D’accord' } };
  if (type === 'nps') q.scale = { low: { en: 'Not likely', fr: 'Peu probable' }, high: { en: 'Very likely', fr: 'Très probable' } };
  if (['image', 'video', 'file'].includes(type)) q.media = { max: type === 'image' ? 3 : 1, maxMb: 10 };
  if (type === 'recordPicker') q.recordType = 'farmer';
  if (type === 'calculated') q.formula = '';
  if (type === 'repeatGroup') q.children = [{ id: 'item', type: 'shortText', label: { en: 'Item', fr: 'Élément' } }];
  if (type === 'table') { q.rows = [o('row1', 'Row 1', 'Ligne 1')]; q.columns = [o('col1', 'Column 1', 'Colonne 1')]; }
  return q;
}
