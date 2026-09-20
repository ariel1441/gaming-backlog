function flagEnabled(value) {
  return String(value || "").trim().toLowerCase() === "true";
}

export function notificationLabEnabled(env = process.env) {
  return env.NODE_ENV === "development" && flagEnabled(env.NOTIFICATION_LAB_ENABLED);
}

export function assertNotificationLabConfiguration(env = process.env) {
  const requested = flagEnabled(env.NOTIFICATION_LAB_ENABLED);
  if (requested && env.NODE_ENV !== "development") {
    throw new Error(
      "NOTIFICATION_LAB_ENABLED=true is allowed only when NODE_ENV=development.",
    );
  }
  return requested;
}
