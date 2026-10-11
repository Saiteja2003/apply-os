import { extractJob } from "./scrapers/index";

(() => {
  try {
    return extractJob();
  } catch {
    return null;
  }
})();
