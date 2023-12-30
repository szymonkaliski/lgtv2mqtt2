import { homedir } from "os";
import path from "path";
import fs from "fs";

export default function getConfig(filePath, exampleConfig) {
  const configPath = path.join(homedir(), filePath);

  if (!fs.existsSync(configPath)) {
    console.log(`No "${configPath}" found, create one with this content:

${JSON.stringify(exampleConfig, null, 2)}`);

    process.exit(1);
  }

  let config;

  try {
    config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
  } catch (e) {
    console.log(`Couldn't parse "${configPath}"

${e}`);

    process.exit(1);
  }

  let anyKeyMissing = false;
  Object.keys(exampleConfig).forEach((requiredKey) => {
    if (!config.hasOwnProperty(requiredKey)) {
      console.log(
        `Missing key "${requiredKey}" in config file "${configPath}"`
      );
      anyKeyMissing = true;
    }
  });

  if (anyKeyMissing) {
    process.exit(1);
  }

  return config;
}
