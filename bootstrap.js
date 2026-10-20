/* global Zotero, Services */
/* eslint-disable no-unused-vars */

var GroupLinkedFiles;

function install() {}

async function startup({ id, version, rootURI }) {
	await Zotero.initializationPromise;
	Services.scriptloader.loadSubScript(rootURI + "src/glf.js");
	GroupLinkedFiles.init({ id, version, rootURI });
	await GroupLinkedFiles.startup();
}

function onMainWindowLoad({ window }) {
	GroupLinkedFiles?.addToWindow(window);
}

function onMainWindowUnload({ window }) {
	GroupLinkedFiles?.removeFromWindow(window);
}

function shutdown() {
	GroupLinkedFiles?.shutdown();
	GroupLinkedFiles = undefined;
}

function uninstall() {}
