import { Router } from "express";
import { CacheController } from "../controllers/cache-controller";

const router = Router();

router.delete("/channel/:channelId", CacheController.clearChannelCache);

export default router;
