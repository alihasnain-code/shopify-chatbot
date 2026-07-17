import redis from "./redis";
import { Queue } from "bullmq";

export const policySyncQueue = new Queue("policy-sync", {
    connection: redis,
});