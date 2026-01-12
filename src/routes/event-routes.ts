import { Router } from "express";
import { EventController } from "../controllers/event-controller";

const router = Router();

router.post("/events", EventController.handleEvent);

export default router;

