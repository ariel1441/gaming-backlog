import { celebrate, Segments, Joi } from "celebrate";

const opts = { convert: true, abortEarly: false, stripUnknown: true };

const id = Joi.number().integer().positive().required();
const steamAppId = Joi.string().trim().pattern(/^\d{1,20}$/).required();
const forceBody = Joi.object({
  force: Joi.boolean().optional(),
});

const importStatus = Joi.string()
  .valid("all", "active", "done", "pending", "accepted", "attached", "ignored", "imported")
  .default("active");

const importGroup = Joi.string()
  .valid(
    "all",
    "needs_match",
    "matched",
    "duplicates",
    "unplayed",
    "played_bit",
    "playing",
    "played_alot",
    "likely_finished",
    "filtered"
  )
  .default("all");

const achievementFilter = Joi.string()
  .valid("all", "has", "complete", "close", "not_synced", "unavailable")
  .default("all");

const librarySort = Joi.string()
  .valid(
    "name",
    "playtime_desc",
    "playtime_asc",
    "last_played_desc",
    "last_played_asc",
    "achievement_desc",
    "achievement_asc",
    "achievement_synced",
    "backlog_state"
  )
  .default("name");

const scopeSchema = Joi.object({
  group: importGroup.required(),
  status: importStatus.default("active"),
  query: Joi.string().trim().max(120).allow("").default(""),
});

export const steamSchemas = {
  idParams: Joi.object({
    id,
  }),
  candidateIdParams: Joi.object({
    id,
  }),
  gameAchievementParams: Joi.object({
    gameId: id,
  }),
  unlinkParams: Joi.object({
    gameId: id,
    steamAppId,
  }),
  devLinkBody: Joi.object({
    steamId: Joi.string().trim().pattern(/^\d{10,24}$/).required(),
    summary: Joi.object({
      displayName: Joi.string().trim().max(120).allow("", null),
      profileUrl: Joi.string().trim().uri().max(300).allow("", null),
      avatarUrl: Joi.string().trim().uri().max(500).allow("", null),
      visibilityState: Joi.number().integer().allow(null),
    }).optional(),
  }),
  forceBody,
  achievementBatchBody: forceBody.keys({
    limit: Joi.number().integer().min(1).max(250).optional(),
  }),
  importCandidatesQuery: Joi.object({
    status: importStatus,
    group: importGroup,
    achievement: achievementFilter,
    sort: librarySort,
    q: Joi.string().trim().max(120).allow("").default(""),
    limit: Joi.number().integer().min(1).max(100).default(100),
    offset: Joi.number().integer().min(0).max(100000).default(0),
  }),
  updateCandidateBody: Joi.object({
    action: Joi.string()
      .valid("ignore", "restore", "set_status", "select_catalog", "accept")
      .required(),
    status: Joi.string().trim().max(80).when("action", {
      is: "set_status",
      then: Joi.required(),
      otherwise: Joi.optional(),
    }),
    catalog_game_id: Joi.number().integer().positive().when("action", {
      is: "select_catalog",
      then: Joi.required(),
      otherwise: Joi.optional(),
    }),
  }),
  bulkCandidateBody: Joi.object({
    candidateIds: Joi.array()
      .items(Joi.number().integer().positive())
      .min(1)
      .max(250)
      .unique(),
    scope: scopeSchema.optional(),
    action: Joi.string().valid("ignore", "restore", "accept", "set_status").required(),
    status: Joi.string().trim().max(80).when("action", {
      is: "set_status",
      then: Joi.required(),
      otherwise: Joi.optional(),
    }),
  }).or("candidateIds", "scope"),
  autoMatchBody: Joi.object({
    limit: Joi.number().integer().min(1).max(250).optional(),
  }),
  linkCandidatesQuery: Joi.object({
    q: Joi.string().trim().max(120).allow("").default(""),
    gameId: Joi.number().integer().positive().optional(),
    limit: Joi.number().integer().min(1).max(50).default(20),
  }),
  duplicateMergeBody: Joi.object({
    keepGameId: id,
    duplicateGameIds: Joi.array()
      .items(Joi.number().integer().positive())
      .min(1)
      .max(25)
      .unique()
      .required(),
  }),
  attachBody: Joi.object({
    gameId: id,
  }),
  importBody: Joi.object({
    candidateIds: Joi.array()
      .items(Joi.number().integer().positive())
      .min(1)
      .max(250)
      .unique(),
    scope: scopeSchema.optional(),
  }).or("candidateIds", "scope"),
};

export const devLinkSteam = celebrate(
  {
    [Segments.BODY]: steamSchemas.devLinkBody,
  },
  opts
);

export const steamSync = celebrate(
  {
    [Segments.BODY]: steamSchemas.forceBody,
  },
  opts
);

export const steamAchievementBatchSync = celebrate(
  {
    [Segments.BODY]: steamSchemas.achievementBatchBody,
  },
  opts
);

export const steamGameAchievementSync = celebrate(
  {
    [Segments.PARAMS]: steamSchemas.gameAchievementParams,
    [Segments.BODY]: steamSchemas.forceBody,
  },
  opts
);

export const listSteamImports = celebrate(
  {
    [Segments.QUERY]: steamSchemas.importCandidatesQuery,
  },
  opts
);

export const steamCandidateId = celebrate(
  {
    [Segments.PARAMS]: steamSchemas.candidateIdParams,
  },
  opts
);

export const updateSteamCandidate = celebrate(
  {
    [Segments.PARAMS]: steamSchemas.candidateIdParams,
    [Segments.BODY]: steamSchemas.updateCandidateBody,
  },
  opts
);

export const bulkSteamCandidates = celebrate(
  {
    [Segments.BODY]: steamSchemas.bulkCandidateBody,
  },
  opts
);

export const autoMatchSteam = celebrate(
  {
    [Segments.BODY]: steamSchemas.autoMatchBody,
  },
  opts
);

export const listSteamLinks = celebrate(
  {
    [Segments.QUERY]: steamSchemas.linkCandidatesQuery,
  },
  opts
);

export const mergeSteamDuplicates = celebrate(
  {
    [Segments.BODY]: steamSchemas.duplicateMergeBody,
  },
  opts
);

export const attachSteamCandidate = celebrate(
  {
    [Segments.PARAMS]: steamSchemas.candidateIdParams,
    [Segments.BODY]: steamSchemas.attachBody,
  },
  opts
);

export const unlinkSteamGame = celebrate(
  {
    [Segments.PARAMS]: steamSchemas.unlinkParams,
  },
  opts
);

export const importSteam = celebrate(
  {
    [Segments.BODY]: steamSchemas.importBody,
  },
  opts
);
