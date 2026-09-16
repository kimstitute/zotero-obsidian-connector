var connector;
function install() {}
function uninstall() {}
async function startup({rootURI}) {
  await Zotero.initializationPromise;
  await Zotero.uiReadyPromise;
  const scope = {Zotero, ChromeUtils, Services, URL: Zotero.getMainWindow().URL};
  Services.scriptloader.loadSubScript(rootURI + 'note-document.js', scope);
  Services.scriptloader.loadSubScript(rootURI + 'note-tabs.js', scope);
  Services.scriptloader.loadSubScript(rootURI + 'codex-translation.js', scope);
  Services.scriptloader.loadSubScript(rootURI + 'connector.js', scope);
  connector = scope.createBridge();
  Zotero.ObsidianConnector = connector;
  await Zotero.PreferencePanes.register({
    pluginID: 'zotero-obsidian-connector@local', id: 'zoc-preferences',
    label: 'Obsidian Connector', src: rootURI + 'preferences.xhtml',
    scripts: [rootURI + 'preferences.js'], stylesheets: [rootURI + 'preferences.css'],
    image: rootURI + 'icons/icon-48.png'
  });
  await connector.start();
}
async function shutdown() {
  Zotero.PreferencePanes.unregister('zoc-preferences');
  if (connector) await connector.stop();
  delete Zotero.ObsidianConnector;
  connector = null;
}
function onMainWindowLoad({window}) { if (connector) connector.addWindow(window); }
function onMainWindowUnload({window}) { if (connector) connector.removeWindow(window); }
