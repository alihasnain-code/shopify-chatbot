import { Redis } from "ioredis";

// eslint-disable-next-line no-undef
const redis = new Redis(process.env.REDIS_URL!, { maxRetriesPerRequest: null });

export default redis;