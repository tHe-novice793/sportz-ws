import { Router } from "express";
import { matchIdParamSchema } from "../validation/matches.js";
import {
  createCommentarySchema,
  listCommentaryQuerySchema,
} from "../validation/commentary.js";
import { commentary } from "../db/schema.js";
import { db } from "../db/db.js";
import { desc, eq } from "drizzle-orm";

export const commentaryRouter = Router({ mergeParams: true });
const MAX_LIMIT = 100;

commentaryRouter.get("/", async (req, res) => {
  const paramsResult = matchIdParamSchema.safeParse(req.params);
  if (!paramsResult.success) {
    return res
      .status(400)
      .json({ error: "Invalid match ID.", details: paramsResult.error.issues });
  }

  const queryResult = listCommentaryQuerySchema.safeParse(req.query);
  if (!queryResult.success) {
    return res
      .status(400)
      .json({ error: "Invalid query.", details: queryResult.error.issues });
  }
  try {
    const { id: matchId } = paramsResult.data;
    const { limit = 10 } = queryResult.data;

    const safeLimit = Math.min(limit, MAX_LIMIT);
    const results = await db
      .select()
      .from(commentary)
      .where(eq(commentary.matchId, matchId))
      .orderBy(desc(commentary.createdAt))
      .limit(safeLimit);

    res.status(200).json({ data: results });
  } catch (e) {
    console.error("Failed to fetch commentary:", e);
    res.status(500).json({ error: "Failed to fetch commentary." });
  }
});

commentaryRouter.post("/", async (req, res) => {
  const paramResult = matchIdParamSchema.safeParse(req.params);

  if (!paramResult.success) {
    return res
      .status(400)
      .json({ error: "Invalid match ID.", details: paramResult.error.issues });
  }

  const bodyResult = createCommentarySchema.safeParse(req.body);
  if (!bodyResult.success) {
    return res.status(400).json({
      error: "Invalid commentary payload",
      details: bodyResult.error.issues,
    });
  }

  try {
    const { minute, ...rest } = bodyResult.data;
    const [result] = await db
      .insert(commentary)
      .values({
        matchId: paramResult.data.id,
        minute: minute,
        ...rest,
      })
      .returning();

    if (res.app.locals.broadcastCommentary) {
      try {
        res.app.locals.broadcastCommentary(result.matchId, result);
      } catch (broadcastError) {
        console.error("Failed to broadcast commentary:", broadcastError);
      }
    }

    res.status(201).json({ data: result });
  } catch (e) {
    console.error("Failed to create commentary:", e);
    res.status(500).json({ error: "Failed to create commentary." });
  }
});
