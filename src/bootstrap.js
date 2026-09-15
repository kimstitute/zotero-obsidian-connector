var connector;
function install() {}
function uninstall() {}
async function startup({rootURI}) {
  await Zotero.initializationPromise;
  await Zotero.uiReadyPromise;
  const scope = {Zotero, ChromeUtils, Services, URL: Zotero.getMainWindow().URL};
  Services.scriptloader.loadSubScript(rootURI + 'note-document.js', scope);
  Services.scriptloader.loadSubScript(rootURI + 'note-tabs.js', scope);
  Services.scriptloader.loadSubScript(rootURI + 'connector.js', scope);
  connector = scope.createBridge();
  Zotero.ObsidianConnector = connector;
  await connector.start();
}
async function shutdown() {
  if (connector) await connector.stop();
  delete Zotero.ObsidianConnector;
  connector = null;
}
function onMainWindowLoad({window}) { if (connector) connector.addWindow(window); }
function onMainWindowUnload({window}) { if (connector) connector.removeWindow(window); }
