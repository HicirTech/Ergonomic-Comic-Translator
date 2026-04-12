import { relative, resolve } from "path";
import {
	apiUploadsRootDir,
	defaultOcrOutputScopeName,
	filesRootDir,
	ocrOutputFileName,
	ocrOutputRootDir,
	ocrPrepareRootDir,
	ocrSourceName,
	projectRoot,
	resolveOcrRuntimeConfig,
	supportedOcrInputExtensions,
	tempRootDir,
} from "../config.ts";

export { projectRoot };
export const inputDir = filesRootDir;
export const outputDir = ocrOutputRootDir;
export const prepareDir = ocrPrepareRootDir;
export const outputFileName = ocrOutputFileName;
export const tempDir = tempRootDir;
export const sourceName = ocrSourceName;
export const defaultOutputScope = defaultOcrOutputScopeName;
export const supportedExtensions = new Set<string>(supportedOcrInputExtensions);
export const ocrRuntimeConfig = resolveOcrRuntimeConfig();

export const resolveOutputScopeForInput = (inputPath: string) => {
	const relativeToUploadRoot = relative(apiUploadsRootDir, inputPath).replace(/\\/g, "/");
	if (!relativeToUploadRoot || relativeToUploadRoot === "." || relativeToUploadRoot === ".." || relativeToUploadRoot.startsWith("../")) {
		return defaultOutputScope;
	}

	const [scope] = relativeToUploadRoot.split("/");
	return scope || defaultOutputScope;
};

export const resolveOutputFileForScope = (scope: string) => resolve(outputDir, scope, outputFileName);
export const resolvePrepareDirForScope = (scope: string) => resolve(prepareDir, scope);
