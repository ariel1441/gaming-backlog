import {
  BarChart3,
  Clock3,
  Compass,
  Download,
  Gamepad2,
  LibraryBig,
  List,
  MessageSquareText,
  PlaySquare,
} from "lucide-react";

export const primaryNavigationItems = [
  { to: "/", label: "Backlog", icon: LibraryBig, end: true },
  { to: "/next-up", label: "Play Next", icon: PlaySquare },
  { to: "/discover", label: "Discover", icon: Compass },
  { to: "/lists", label: "Lists", icon: List },
  { to: "/timeline", label: "Timeline", icon: Clock3, authOnly: true },
  {
    to: "/reviews",
    label: "Reviews",
    icon: MessageSquareText,
    authOnly: true,
  },
  { to: "/insights", label: "Insights", icon: BarChart3 },
];

export const libraryNavigationItems = [
  {
    to: "/steam/library",
    label: "Steam Library",
    icon: Gamepad2,
    savedAccountOnly: true,
  },
  {
    to: "/steam/import",
    label: "Steam Review",
    icon: Download,
    savedAccountOnly: true,
  },
];

export const mobilePrimaryNavigationItems = primaryNavigationItems.filter(
  (item) =>
    ["/", "/discover", "/lists", "/timeline"].includes(item.to),
);

export const mobileMoreNavigationItems = primaryNavigationItems.filter(
  (item) => ["/next-up", "/reviews", "/insights"].includes(item.to),
);

export function navigationItemMatchesPath(item, pathname) {
  if (!item?.to || !pathname) return false;
  if (item.end) return pathname === item.to;
  return pathname === item.to || pathname.startsWith(`${item.to}/`);
}

export function isMobileMorePath(pathname) {
  const moreItems = [
    ...mobileMoreNavigationItems,
    ...libraryNavigationItems,
    { to: "/me" },
    { to: "/settings" },
  ];
  return moreItems.some((item) => navigationItemMatchesPath(item, pathname));
}

export function visibleNavigationItems(
  items,
  { isAuthenticated = false, isGuest = false } = {},
) {
  return items.filter((item) => {
    if (item.authOnly && !isAuthenticated) return false;
    if (item.savedAccountOnly && (!isAuthenticated || isGuest)) return false;
    return true;
  });
}
