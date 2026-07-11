import {
  BarChart3,
  Clock3,
  Compass,
  Download,
  Gamepad2,
  LibraryBig,
  List,
  MessageSquareText,
} from "lucide-react";

export const primaryNavigationItems = [
  { to: "/", label: "Backlog", icon: LibraryBig, end: true },
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
