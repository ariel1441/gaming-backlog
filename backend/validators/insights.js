import { celebrate, Joi, Segments } from "celebrate";

export const insightsQuerySchema = Joi.object({
  year: Joi.number().integer().min(2000).max(2100).optional(),
}).unknown(false);

export const insightsQuery = celebrate(
  { [Segments.QUERY]: insightsQuerySchema },
  { convert: true, abortEarly: false, stripUnknown: false },
);
