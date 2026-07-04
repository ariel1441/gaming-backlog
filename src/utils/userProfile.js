export const DISPLAY_NAME_MAX_LENGTH = 40;
export const BIO_MAX_LENGTH = 240;

export const avatarIconGroups = [
  {
    label: "General",
    icons: [
      { value: "gamepad", label: "Gamepad" },
      { value: "joystick", label: "Joystick" },
      { value: "dice", label: "Dice" },
      { value: "trophy", label: "Trophy" },
      { value: "crown", label: "Crown" },
      { value: "flame", label: "Flame" },
      { value: "star", label: "Star" },
      { value: "heart", label: "Heart" },
    ],
  },
  {
    label: "Adventure",
    icons: [
      { value: "sword", label: "Sword" },
      { value: "shield", label: "Shield" },
      { value: "book", label: "Book" },
      { value: "compass", label: "Compass" },
      { value: "potion", label: "Potion" },
      { value: "hourglass", label: "Hourglass" },
      { value: "rune", label: "Rune" },
      { value: "mask", label: "Mask" },
    ],
  },
  {
    label: "Vibes",
    icons: [
      { value: "cards", label: "Cards" },
      { value: "axe", label: "Axe" },
      { value: "crystal", label: "Crystal" },
      { value: "rocket", label: "Rocket" },
      { value: "leaf", label: "Leaf" },
      { value: "flower", label: "Flower" },
      { value: "coffee", label: "Coffee" },
      { value: "cpu", label: "CPU" },
      { value: "eye", label: "Eye" },
      { value: "skull", label: "Skull" },
      { value: "zap", label: "Lightning" },
      { value: "headphones", label: "Headphones" },
    ],
  },
];

export const avatarIconOptions = avatarIconGroups.flatMap((group) => group.icons);

export const avatarColorOptions = [
  { value: "orange", label: "Orange" },
  { value: "blue", label: "Blue" },
  { value: "green", label: "Green" },
  { value: "pink", label: "Pink" },
  { value: "violet", label: "Violet" },
  { value: "gold", label: "Gold" },
  { value: "slate", label: "Slate" },
  { value: "red", label: "Red" },
];

const avatarIconValues = new Set(avatarIconOptions.map((option) => option.value));
const avatarColorValues = new Set(avatarColorOptions.map((option) => option.value));

export const DEFAULT_PROFILE_FIELDS = {
  display_name: "",
  bio: "",
  avatar_icon: "gamepad",
  avatar_color: "orange",
};

export function normalizeProfileFields(profile) {
  const source = profile || {};
  const display_name =
    typeof source.display_name === "string"
      ? source.display_name.slice(0, DISPLAY_NAME_MAX_LENGTH)
      : "";
  const bio =
    typeof source.bio === "string" ? source.bio.slice(0, BIO_MAX_LENGTH) : "";
  const avatar_icon = avatarIconValues.has(source.avatar_icon)
    ? source.avatar_icon
    : DEFAULT_PROFILE_FIELDS.avatar_icon;
  const avatar_color = avatarColorValues.has(source.avatar_color)
    ? source.avatar_color
    : DEFAULT_PROFILE_FIELDS.avatar_color;

  return {
    display_name,
    bio,
    avatar_icon,
    avatar_color,
  };
}

export function normalizeUserWithProfile(user) {
  if (!user) return user;
  return {
    ...user,
    ...normalizeProfileFields(user),
  };
}

export function profileDisplayName(profile) {
  const normalized = normalizeProfileFields(profile);
  return normalized.display_name.trim() || `@${profile?.username || "player"}`;
}

export function profileHandle(profile) {
  return `@${profile?.username || "player"}`;
}
