import { celebrate, Joi, Segments } from "celebrate";

export const insightsQuerySchema = Joi.object({
  weekly_hours: Joi.number().integer().min(0).max(200).default(0),
  include_missing_names: Joi.boolean().default(false),
}).unknown(false);

export const insightsQuery = celebrate(
  { [Segments.QUERY]: insightsQuerySchema },
  { convert: true, abortEarly: false, stripUnknown: false },
);
