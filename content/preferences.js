/* global Zotero, document, window, ChromeUtils */

var GroupLinkedFilesPrefs = {
	get glf() {
		return Zotero.GroupLinkedFiles;
	},

	_initialized: false,

	init() {
		if (this._initialized) {
			return;
		}
		this._initialized = true;
		document.getElementById("glf-group")
			.addEventListener("command", () => this.onGroupChange());
		document.getElementById("glf-choose")
			.addEventListener("command", () => this.chooseFolder());
		document.getElementById("glf-check")
			.addEventListener("command", () => this.refresh(true));

		for (let label of document.querySelectorAll("#glf-prefs .glf-label")) {
			label.style.marginTop = "10px";
		}
		let input = document.getElementById("glf-base");
		input.style.flex = "1";
		input.style.minWidth = "0";
		let status = document.getElementById("glf-status");
		status.style.whiteSpace = "pre-wrap";
		status.style.fontFamily = "inherit";
		status.style.margin = "0 0 8px";
		status.style.transition = "opacity 120ms ease-out";

		this.populateGroups();
		input.value = this.glf.getPref("basePath") || "";
		this.refresh(false);
	},

	populateGroups() {
		let menulist = document.getElementById("glf-group");
		let popup = document.getElementById("glf-group-popup");
		popup.replaceChildren();

		let none = document.createXULElement("menuitem");
		none.setAttribute("value", "0");
		none.setAttribute("data-l10n-id", "glf-prefs-group-none");
		popup.append(none);

		let current = this.glf.getGroupID() || 0;
		let groups = Zotero.Groups.getAll().sort((a, b) => a.name.localeCompare(b.name));
		let found = false;
		for (let group of groups) {
			let item = document.createXULElement("menuitem");
			item.setAttribute("value", String(group.id));
			item.setAttribute("label", group.name);
			popup.append(item);
			if (group.id == current) {
				found = true;
			}
		}
		// Configured group not synced on this computer (yet): keep it visible
		if (current && !found) {
			let item = document.createXULElement("menuitem");
			item.setAttribute("value", String(current));
			item.setAttribute("label", `#${current}`);
			popup.append(item);
		}
		menulist.value = String(current);
	},

	onGroupChange() {
		let value = parseInt(document.getElementById("glf-group").value) || 0;
		this.glf.setPref("groupID", value);
		this.refresh(false);
	},

	async chooseFolder() {
		let { FilePicker } = ChromeUtils.importESModule(
			"chrome://zotero/content/modules/filePicker.mjs"
		);
		let fp = new FilePicker();
		fp.init(window, this.glf.l10n("glf-prefs-folder"), fp.modeGetFolder);
		let current = this.glf.getBasePath();
		if (current) {
			fp.displayDirectory = current;
		}
		if (await fp.show() != fp.returnOK) {
			return;
		}
		let path = fp.file;
		if (path && typeof path == "object") {
			path = path.path;
		}
		this.glf.setPref("basePath", path);
		document.getElementById("glf-base").value = path;
		this.refresh(false);
	},

	async refresh(publish) {
		let status = document.getElementById("glf-status");
		let button = document.getElementById("glf-check");
		status.style.opacity = "0.5";
		button.disabled = true;
		try {
			let { lines } = await this.glf.describeStatus({ publish });
			status.textContent = lines.join("\n");
		}
		catch (e) {
			Zotero.logError(e);
			status.textContent = String(e.message || e);
		}
		finally {
			status.style.opacity = "1";
			button.disabled = false;
		}
	},
};

// Depending on the Zotero version, this script runs before or after the pane's markup
// is inserted, and in the window or in a sandbox. Inline handlers can't see this scope,
// so wire everything up from here.
if (document.getElementById("glf-prefs")) {
	GroupLinkedFilesPrefs.init();
}
else {
	let onLoad = (event) => {
		if (event.target && event.target.id == "glf-prefs") {
			document.removeEventListener("load", onLoad, true);
			GroupLinkedFilesPrefs.init();
		}
	};
	document.addEventListener("load", onLoad, true);
}
