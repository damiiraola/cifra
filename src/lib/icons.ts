import { createElement } from "react";
import {
  ArrowLeftRight,
  Banknote,
  Briefcase,
  Bus,
  Clapperboard,
  Ellipsis,
  FileText,
  GraduationCap,
  HeartPulse,
  Home,
  Plus,
  Repeat,
  ShoppingBag,
  Store,
  TrendingUp,
  Utensils,
  Zap,
  type LucideIcon,
} from "lucide-react";

export const ICONS: Record<string, LucideIcon> = {
  Utensils,
  Bus,
  Home,
  Zap,
  HeartPulse,
  GraduationCap,
  Clapperboard,
  ShoppingBag,
  Repeat,
  FileText,
  ArrowLeftRight,
  Ellipsis,
  Banknote,
  Store,
  Briefcase,
  TrendingUp,
  Plus,
};

export function CatIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICONS[name] ?? Ellipsis;
  return createElement(Icon, { className });
}
