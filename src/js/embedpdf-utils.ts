import type {
  CommandsPlugin,
  DocumentManagerPlugin,
  PluginRegistry,
  UIPlugin,
} from '@embedpdf/snippet';

export const getDocManager = async (registry: PluginRegistry) => {
  return registry
    ?.getPlugin<InstanceType<typeof DocumentManagerPlugin>>('document-manager')
    ?.provides();
};
export const getViewerUi = async (registry: PluginRegistry) => {
  return registry
    ?.getPlugin<InstanceType<typeof UIPlugin>>('ui')
    ?.provides();
}
export const getViewerCommands = async (registry: PluginRegistry) => {
  return registry
    ?.getPlugin<InstanceType<typeof CommandsPlugin>>('commands')
    ?.provides();
}
