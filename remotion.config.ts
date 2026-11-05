import { Config } from "@remotion/cli/config";
import { config } from "./src/intro.config";

Config.setEntryPoint("./src/index.ts");
Config.setVideoImageFormat("jpeg");
Config.setJpegQuality(85);
Config.setColorSpace("bt709");
Config.setScale(config.outputScale);
Config.setConcurrency(1);
Config.setChromiumOpenGlRenderer("swangle");
Config.setCodec("h264");
Config.setCrf(28);
Config.setX264Preset("veryfast");
Config.setOverwriteOutput(true);
