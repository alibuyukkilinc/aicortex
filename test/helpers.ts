import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Cortex } from "../src/core/cortex.js";
import { initProject } from "../src/core/init.js";
import { loadProject } from "../src/core/project.js";

export function tempProject(name = "demo") {
  const root = mkdtempSync(join(tmpdir(), "cortex-test-"));
  const init = initProject(root, name);
  const cortex = new Cortex(loadProject(root));
  const human = cortex.actor("owner");
  const ai = cortex.actor("ai-agent");
  return {
    root,
    init,
    cortex,
    human,
    ai,
    cleanup() {
      cortex.close();
      rmSync(root, { recursive: true, force: true });
    },
  };
}
