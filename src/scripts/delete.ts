import { deleteUpload } from "../api/services/delete-service.ts";
import { parseCliArgs } from "./cli-utils.ts";

const { logger, scope } = parseCliArgs({
  name: "delete",
  description: "Delete all data for an upload",
});

logger.info(`Removing all data for uploadId: ${scope}`);
await deleteUpload(scope);
logger.info("Done.");
