import { celebrate, Joi, Segments } from "celebrate";

const opts = { convert: true, abortEarly: false, stripUnknown: true };
const genreName = Joi.string().trim().min(1).max(50).pattern(/^[^,]+$/).required().messages({
  "any.required": "name is required",
  "string.empty": "name is required",
  "string.max": "name must be <= 50 chars",
  "string.pattern.base": "name cannot contain commas during legacy compatibility",
});
const idParams = Joi.object({
  id: Joi.number().integer().positive().required(),
});

export const createPersonalGenre = celebrate(
  { [Segments.BODY]: Joi.object({ name: genreName }) },
  opts,
);

export const updatePersonalGenre = celebrate(
  {
    [Segments.PARAMS]: idParams,
    [Segments.BODY]: Joi.object({ name: genreName }),
  },
  opts,
);

export const mergePersonalGenre = celebrate(
  {
    [Segments.PARAMS]: idParams,
    [Segments.BODY]: Joi.object({
      targetId: Joi.number().integer().positive().required(),
    }),
  },
  opts,
);

export const deletePersonalGenre = celebrate(
  { [Segments.PARAMS]: idParams },
  opts,
);
