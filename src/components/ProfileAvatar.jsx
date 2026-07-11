import React from "react";
import {
  Axe,
  BookOpen,
  Coffee,
  Compass,
  Cpu,
  Crown,
  Dice5,
  Eye,
  Flame,
  FlaskConical,
  Flower2,
  Gamepad2,
  Gem,
  Headphones,
  Heart,
  Hourglass,
  Joystick,
  Landmark,
  Leaf,
  Rocket,
  ScrollText,
  Shield,
  Skull,
  Sparkles,
  Star,
  Sword,
  Trophy,
  Zap,
} from "lucide-react";
import { normalizeProfileFields } from "../utils/userProfile";

const iconMap = {
  gamepad: Gamepad2,
  joystick: Joystick,
  dice: Dice5,
  trophy: Trophy,
  crown: Crown,
  flame: Flame,
  star: Star,
  skull: Skull,
  sword: Sword,
  shield: Shield,
  book: BookOpen,
  rocket: Rocket,
  heart: Heart,
  zap: Zap,
  compass: Compass,
  potion: FlaskConical,
  hourglass: Hourglass,
  headphones: Headphones,
  rune: Landmark,
  mask: Sparkles,
  cards: ScrollText,
  axe: Axe,
  crystal: Gem,
  leaf: Leaf,
  flower: Flower2,
  coffee: Coffee,
  cpu: Cpu,
  eye: Eye,
};

const colorClasses = {
  orange: "border-primary/45 bg-primary/15 text-primary-light shadow-primary/10",
  blue: "border-secondary/45 bg-secondary/15 text-secondary-light shadow-secondary/10",
  green: "border-state-success/45 bg-state-success/15 text-state-success shadow-state-success/10",
  pink: "border-pink-400/45 bg-pink-500/15 text-pink-200 shadow-pink-500/10",
  violet: "border-violet-400/45 bg-violet-500/15 text-violet-200 shadow-violet-500/10",
  gold: "border-yellow-300/45 bg-yellow-400/15 text-yellow-200 shadow-yellow-400/10",
  slate: "border-surface-border bg-surface-elevated text-content-secondary shadow-overlay/10",
  red: "border-state-error/45 bg-state-error/15 text-state-error shadow-state-error/10",
};

const sizes = {
  sm: {
    box: "h-10 w-10 rounded-xl",
    icon: "h-5 w-5",
  },
  md: {
    box: "h-14 w-14 rounded-2xl",
    icon: "h-7 w-7",
  },
  lg: {
    box: "h-20 w-20 rounded-3xl",
    icon: "h-10 w-10",
  },
};

export function profileAvatarIcon(iconKey) {
  return iconMap[iconKey] || Gamepad2;
}

export function profileAvatarColorClass(colorKey) {
  return colorClasses[colorKey] || colorClasses.orange;
}

export default function ProfileAvatar({
  profile,
  icon,
  color,
  size = "md",
  className = "",
}) {
  const normalized = normalizeProfileFields({
    ...profile,
    avatar_icon: icon || profile?.avatar_icon,
    avatar_color: color || profile?.avatar_color,
  });
  const Icon = profileAvatarIcon(normalized.avatar_icon);
  const sizeClasses = sizes[size] || sizes.md;

  return (
    <div
      className={[
        "relative flex shrink-0 items-center justify-center border shadow-lg",
        sizeClasses.box,
        profileAvatarColorClass(normalized.avatar_color),
        className,
      ].join(" ")}
      aria-hidden="true"
    >
      <Icon className={sizeClasses.icon} />
    </div>
  );
}
