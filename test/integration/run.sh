#!/usr/bin/env bash
# Run the integration checks inside a real Zotero (headless via Xvfb).
#
#   ZOTERO_BIN=/path/to/zotero  [XPI=build/group-linked-files-x.y.z.xpi]  bash test/integration/run.sh
#
# Without ZOTERO_BIN, Zotero for Linux is downloaded: the latest release by default,
# ZOTERO_CHANNEL=beta for the beta, or ZOTERO_VERSION=7.0.24 for a specific version.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
HERE="$REPO/test/integration"
WORK="$(mktemp -d)"
LOCALE="${ZOTERO_LOCALE:-de}"

if [[ -z "${ZOTERO_BIN:-}" ]]; then
	CHANNEL="${ZOTERO_CHANNEL:-release}"
	URL="https://www.zotero.org/download/client/dl?channel=$CHANNEL&platform=linux-x86_64"
	if [[ -n "${ZOTERO_VERSION:-}" ]]; then
		URL="$URL&version=$ZOTERO_VERSION"
	fi
	echo "Downloading Zotero (${ZOTERO_VERSION:-$CHANNEL}) …"
	curl -fsSL -o "$WORK/zotero.tar" "$URL"
	tar -xf "$WORK/zotero.tar" -C "$WORK"
	ZOTERO_BIN="$(ls -d "$WORK"/Zotero*_linux-x86_64)/zotero"
fi

if [[ -z "${XPI:-}" ]]; then
	(cd "$REPO" && node scripts/build.mjs >/dev/null)
	XPI="$(ls "$REPO"/build/*.xpi | head -1)"
fi

mkdir -p "$WORK/profile/extensions" "$WORK/data" "$WORK/HU-Box" "$WORK/fixtures/other"
python3 "$HERE/make-pdf.py" "$WORK/HU-Box/Mueller - 1987 - Magnetschwebebahn.pdf" \
	"Die Magnetschwebebahn Transrapid Emsland"
python3 "$HERE/make-pdf.py" "$WORK/fixtures/Neu - 2024 - Hochgeschwindigkeit.pdf" \
	"Hochgeschwindigkeit erste Fassung"
python3 "$HERE/make-pdf.py" "$WORK/fixtures/other/Neu - 2024 - Hochgeschwindigkeit.pdf" \
	"Hochgeschwindigkeit eine ganz andere Datei"
python3 "$HERE/make-pdf.py" "$WORK/fixtures/scan_0042.pdf" "Versuchsanlage Emsland Scan"

# A WebDAV server with basic auth (WsgiDAV; HU-Box's SeafDAV is built on it)
DAV_PORT="${DAV_PORT:-18765}"
mkdir -p "$WORK/dav/Bibliothek/Literatur/Unterordner"
python3 "$HERE/make-pdf.py" "$WORK/dav/Bibliothek/Literatur/weber_1919.pdf" "Wissenschaft als Beruf"
python3 "$HERE/make-pdf.py" "$WORK/dav/Bibliothek/Literatur/Mueller - 1987 - Magnetschwebebahn.pdf" \
	"Die Magnetschwebebahn auf dem Server"
python3 "$HERE/make-pdf.py" "$WORK/dav/Bibliothek/Literatur/klein_2002.pdf" "Schon da, nicht ueberschreiben"
cat > "$WORK/dav.yaml" <<YAML
host: 127.0.0.1
port: $DAV_PORT
provider_mapping:
  "/": "$WORK/dav"
http_authenticator:
  accept_basic: true
  accept_digest: false
  default_to_digest: false
simple_dc:
  user_mapping:
    "*":
      "tester":
        password: "geheim"
verbose: 1
YAML
if python3 -c "import wsgidav, cheroot" 2> /dev/null; then
	python3 -m wsgidav.server.server_cli --config "$WORK/dav.yaml" > "$WORK/dav.log" 2>&1 &
	DAV_PID=$!
	trap 'kill $DAV_PID 2>/dev/null' EXIT
	for _ in $(seq 1 50); do
		curl -s -o /dev/null "http://127.0.0.1:$DAV_PORT/" && break
		sleep 0.2
	done
else
	echo "WsgiDAV not installed (pip install wsgidav cheroot) - WebDAV checks will fail"
fi

# The plugin as users install it (the .xpi), plus the test harness as a second plugin
cp "$XPI" "$WORK/profile/extensions/group-linked-files@pad-mac.github.io.xpi"
(cd "$HERE/harness" && zip -q -r -X "$WORK/profile/extensions/glf-harness@pad-mac.github.io.xpi" .)
echo "Work dir: $WORK"

cat > "$WORK/profile/user.js" <<EOF
user_pref("extensions.autoDisableScopes", 0);
user_pref("extensions.enabledScopes", 15);
user_pref("xpinstall.signatures.required", false);
user_pref("app.update.enabled", false);
user_pref("app.update.auto", false);
user_pref("intl.locale.requested", "$LOCALE");
user_pref("extensions.zotero.dataDir", "$WORK/data");
user_pref("extensions.zotero.useDataDir", true);
user_pref("extensions.zotero.firstRun2", false);
user_pref("extensions.zotero.firstRunGuidance", false);
user_pref("extensions.zotero.sync.autoSync", false);
user_pref("extensions.zotero.autoRenameFiles", false);
user_pref("extensions.zotero.reportTranslationFailure", false);
user_pref("extensions.group-linked-files.groupID", 4711);
user_pref("extensions.group-linked-files.basePath", "$WORK/HU-Box");
user_pref("extensions.group-linked-files.naming.enabled", false);
user_pref("glf-harness.out", "$WORK/results.json");
user_pref("glf-harness.dir", "$WORK");
user_pref("glf-harness.screenshot", "${GLF_SCREENSHOT:-}");
user_pref("glf-harness.screenshot2", "${GLF_SCREENSHOT2:-}");
user_pref("glf-harness.davport", $DAV_PORT);
EOF

echo "Running Zotero: $ZOTERO_BIN"
set +e
timeout "${ZOTERO_TIMEOUT:-300}" xvfb-run -a "$ZOTERO_BIN" -profile "$WORK/profile" \
	-ZoteroDebugText -no-remote > "$WORK/zotero.log" 2>&1
set -e

if [[ ! -f "$WORK/results.json" ]]; then
	echo "No results – Zotero log tail:"
	tail -n 80 "$WORK/zotero.log"
	exit 1
fi

node "$HERE/report.mjs" "$WORK/results.json" "$WORK/zotero.log"
