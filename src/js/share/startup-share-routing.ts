import router from '../router.ts';
import { getMimeTypeFromFileName } from '../mime-types.ts';
import {
  clearSharedParams,
  findAllToolsForMimeTypes,
  getSharedContentInfo,
  loadSharedFiles,
  setupLaunchHandler,
} from '../share-target.ts';
import { showToolChooser, getDefaultToolPath } from '../tool-chooser.ts';
import type { Tool, ToolPayload } from '../types.ts';
import { showMessage } from '../ui.ts';

async function routeFilesToTool(
  files: File[],
  mimeTypes: string[],
  tools: Tool[]
): Promise<boolean> {
  if (files.length === 0) return false;

  const matchingTools = findAllToolsForMimeTypes(tools, mimeTypes);
  if (matchingTools.length === 0) return false;

  let targetTool: Tool | null;

  if (matchingTools.length === 1) {
    targetTool = matchingTools[0];
  } else {
    const defaultPath = getDefaultToolPath(mimeTypes);
    const defaultTool = defaultPath ? matchingTools.find((t) => t.path === defaultPath) : null;

    if (defaultTool) {
      targetTool = defaultTool;
    } else {
      targetTool = await showToolChooser(matchingTools, files, { showRemember: true });
    }
  }

  if (!targetTool) return false;

  const payload: ToolPayload = {
    sharedFiles: files,
    mimeTypes,
  };
  router.goTo(targetTool.path, payload);
  return true;
}

export async function handleStartupSharedLaunch(tools: Tool[]): Promise<boolean> {
  let handledByLaunchOrShare = false;

  try {
    setupLaunchHandler(async (launchFiles) => {
      if (launchFiles.length > 0) {
        const mimeTypes = launchFiles.map((f) => getMimeTypeFromFileName(f.type || '', f.name));
        if (await routeFilesToTool(launchFiles, mimeTypes, tools)) {
          handledByLaunchOrShare = true;
        }
      }
    });
  } catch (error) {
    console.warn('[script] Launch handler setup failed:', error);
  }

  try {
    const sharedInfo = getSharedContentInfo();
    const hasShareParams = sharedInfo !== null;

    if (typeof sharedInfo === 'string') {
      showMessage('shared target error: ' + sharedInfo, { type: 'alert' });
      return false;
    }

    if (sharedInfo) {
      const sharedFiles = await loadSharedFiles(sharedInfo.keys);
      if (sharedFiles.length > 0) {
        if (await routeFilesToTool(sharedFiles, sharedInfo.mimeTypes, tools)) {
          handledByLaunchOrShare = true;
        }
      } else {
        console.warn('[script] No tool found for shared MIME types:', sharedInfo.mimeTypes);
      }
    }

    if (hasShareParams) {
      clearSharedParams();
    }
  } catch (error) {
    console.warn('[script] Share target handling failed:', error);
  }

  return handledByLaunchOrShare;
}
