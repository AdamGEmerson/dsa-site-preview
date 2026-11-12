// EmDash's live collection: every content type in the database is queried through it
// (getEmDashCollection / getEmDashEntry from "emdash").
import { defineLiveCollection } from "astro:content";
import { emdashLoader } from "emdash/runtime";

export const collections = {
  _emdash: defineLiveCollection({ loader: emdashLoader() }),
};
