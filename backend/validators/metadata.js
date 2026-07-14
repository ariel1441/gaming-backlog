import { celebrate, Joi, Segments } from "celebrate";

const opts = { convert: true, abortEarly: false, stripUnknown: true };
const id = Joi.number().integer().positive().required();

export const listMetadataCandidates = celebrate(
  {
    [Segments.QUERY]: Joi.object({
      decision: Joi.string()
        .valid("pending", "accepted", "rejected", "skipped")
        .default("pending"),
      limit: Joi.number().integer().min(1).max(100).default(50),
    }),
  },
  opts,
);

export const decideMetadataCandidate = celebrate(
  {
    [Segments.PARAMS]: Joi.object({ id }),
    [Segments.BODY]: Joi.object({
      action: Joi.string().valid("accept", "reject", "skip").required(),
    }),
  },
  opts,
);

export const selectGameMetadata = celebrate(
  {
    [Segments.PARAMS]: Joi.object({ gameId: id }),
    [Segments.BODY]: Joi.object({
      rawg_id: Joi.number().integer().positive().required(),
    }),
  },
  opts,
);
