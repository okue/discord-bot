import type { Feature } from "../core/feature";
import { rssFeature } from "./rss";

/** Register new features here */
export const features: readonly Feature[] = [rssFeature];
