import { getAppConfig } from "./config";
import { assertNonEmpty, toBool } from "./utils/guards";
import { runSyncWorkflow } from "./workflows/syncWorkflow";
const { logInfo, logWarn } = require("./services/logger");

async function main(): Promise<void> {
  const config = getAppConfig();
  const appName = assertNonEmpty(config.appName, "appName");
  const workflowResult = await runSyncWorkflow();

  logInfo(`appName=${appName}`);
  logInfo(`environment=${config.environment}`);
  logInfo(`workflowOk=${toBool(workflowResult.ok)}`);
  logInfo(`workflowSummary=${workflowResult.summary}`);
  const warningsText = workflowResult.warnings.join(" | ") || "none";
  if (warningsText === "none") {
    logInfo(`warnings=${warningsText}`);
  } else {
    logWarn(`warnings=${warningsText}`);
  }
}

void main();
