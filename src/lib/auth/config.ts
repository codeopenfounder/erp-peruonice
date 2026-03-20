// --------------------------------------------------------------------------
// Auth configuration for POI ERP
// --------------------------------------------------------------------------

// POI uses granular per-module permissions instead of predefined roles.
// See src/lib/constants/modules.ts for module definitions.
// Owners (profiles.is_owner = true) have full access to everything.
// Other users get access via the user_permissions table (per-module CRUD booleans).

export const ALWAYS_ACCESSIBLE_ROUTES = [
  "/dashboard",
  "/config/general",
  "/config/notificaciones",
]
