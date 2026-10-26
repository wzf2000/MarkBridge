"""Install pinned public WordPress in a new, synthetic local CI database."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import stat
import time
import urllib.error
import subprocess
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[1]
DOWNLOAD_LIMIT = 64 * 1024 * 1024


def install_test_locales(archive, site):
    """Install verified core translations without changing site or user language."""
    target = site / "wp-content" / "languages"
    if (
        target.exists()
        or target.is_symlink()
        or site.is_symlink()
        or not target.parent.is_dir()
        or target.parent.is_symlink()
        or archive.is_symlink()
        or not archive.is_file()
        or archive.stat().st_size > 8 * 1024 * 1024
    ):
        raise RuntimeError("Test language target must be a new directory")
    pattern = re.compile(
        r"(?:admin(?:-network)?-|continents-cities-)?zh_CN"
        r"(?:-[a-f0-9]{32})?\.(?:mo|po|json|l10n\.php)"
    )
    with zipfile.ZipFile(archive) as bundle:
        entries = bundle.infolist()
        names = [entry.filename for entry in entries]
        if (
            not entries
            or len(entries) > 256
            or len(names) != len(set(names))
            or "zh_CN.mo" not in names
            or sum(entry.file_size for entry in entries) > 20 * 1024 * 1024
        ):
            raise RuntimeError("Unexpected core language inventory")
        for entry in entries:
            if (
                not pattern.fullmatch(entry.filename)
                or entry.is_dir()
                or stat.S_ISLNK(entry.external_attr >> 16)
                or entry.file_size > 4 * 1024 * 1024
                or entry.flag_bits & 1
            ):
                raise RuntimeError("Unexpected core language archive entry")
        if bundle.testzip():
            raise RuntimeError("Core language ZIP CRC failed")
        contents = {entry.filename: bundle.read(entry) for entry in entries}
    target.mkdir(parents=True, mode=0o755)
    for name, body in contents.items():
        file = target / name
        file.write_bytes(body)
        file.chmod(0o644)
    return {name: hashlib.sha256(body).hexdigest() for name, body in sorted(contents.items())}


def temporary_download_error(error):
    if isinstance(error, urllib.error.HTTPError):
        return error.code == 429 or 500 <= error.code <= 599
    return isinstance(error, TimeoutError) or (
        isinstance(error, urllib.error.URLError) and isinstance(error.reason, TimeoutError)
    )


def dependency(name, downloads, pins):
    pin = pins[name]
    target = downloads / Path(pin["url"]).name
    if target.is_symlink():
        raise RuntimeError("Public dependency cache cannot be a symlink: " + name)
    if not target.exists():
        request = urllib.request.Request(pin["url"], headers={"User-Agent": "MarkBridge-CI"})
        for attempt in range(3):
            try:
                with urllib.request.urlopen(request, timeout=60) as response:
                    data = response.read(DOWNLOAD_LIMIT + 1)
            except (urllib.error.URLError, TimeoutError) as error:
                if attempt == 2 or not temporary_download_error(error):
                    raise
                time.sleep(attempt + 1)
                continue
            if len(data) > DOWNLOAD_LIMIT:
                raise RuntimeError("Public dependency exceeds download limit")
            if hashlib.sha256(data).hexdigest() != pin["sha256"]:
                raise RuntimeError("Public dependency digest mismatch: " + name)
            target.write_bytes(data)
            break
    if target.stat().st_size > DOWNLOAD_LIMIT:
        raise RuntimeError("Public dependency exceeds download limit")
    if hashlib.sha256(target.read_bytes()).hexdigest() != pin["sha256"]:
        raise RuntimeError("Public dependency digest mismatch: " + name)
    return target


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--wordpress", required=True, type=Path)
    parser.add_argument("--downloads", required=True, type=Path)
    parser.add_argument("--wp-cli", required=True, type=Path, help="New executable wrapper path")
    parser.add_argument("--php", default=shutil.which("php"))
    parser.add_argument("--with-test-locales", action="store_true")
    args = parser.parse_args()
    site, downloads, wrapper = (
        args.wordpress.resolve(),
        args.downloads.resolve(),
        args.wp_cli.resolve(),
    )
    database = os.environ.get("MARKBRIDGE_CI_DB_NAME", "")
    host = os.environ.get("MARKBRIDGE_CI_DB_HOST", "")
    if not re.fullmatch(r"markbridge_ci_[a-z0-9_]+", database):
        parser.error("Use a dedicated markbridge_ci_* synthetic database")
    if not re.fullmatch(r"127\.0\.0\.1:[0-9]{1,5}", host):
        parser.error("Use an explicitly bound loopback database port")
    if site.exists() or wrapper.exists() or site == Path("/") or site in wrapper.parents:
        parser.error("WordPress and wrapper must be new paths, wrapper outside WordPress")
    php = Path(args.php).resolve()
    pins = json.loads((ROOT / "scripts/ci-dependencies.json").read_text())
    downloads.mkdir(parents=True, exist_ok=True)
    archive = dependency("wordpress", downloads, pins)
    phar = dependency("wp_cli", downloads, pins)
    site.mkdir(parents=True)
    with zipfile.ZipFile(archive) as bundle:
        if bundle.testzip():
            raise RuntimeError("WordPress ZIP CRC failed")
        for name in bundle.namelist():
            relative = Path(name)
            if relative.parts[0] != "wordpress" or ".." in relative.parts:
                raise RuntimeError("Unexpected WordPress archive path")
            target = site.joinpath(*relative.parts[1:])
            if name.endswith("/"):
                target.mkdir(parents=True, exist_ok=True)
            else:
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(bundle.read(name))
    # JSON-encoded strings are consumed by Python, never interpreted as shell code.
    wrapper.parent.mkdir(parents=True, exist_ok=True)
    wrapper.write_text(
        "#!/usr/bin/env python3\nimport os,sys\n"
        + "os.execv("
        + repr(str(php))
        + ", ["
        + repr(str(php))
        + ", '-d', 'display_errors=stderr', "
        + repr(str(phar))
        + "] + sys.argv[1:])\n"
    )
    wrapper.chmod(0o700)

    def wp(*command):
        return subprocess.check_output(
            [str(wrapper), "--path=" + str(site), *command], text=True
        ).strip()

    if wp("--version") != "WP-CLI " + pins["wp_cli"]["version"]:
        raise RuntimeError("Unexpected WP-CLI version")
    wp(
        "config",
        "create",
        "--dbhost=" + host,
        "--dbname=" + database,
        "--dbuser=" + os.environ.get("MARKBRIDGE_CI_DB_USER", "root"),
        "--dbpass=" + os.environ.get("MARKBRIDGE_CI_DB_PASSWORD", ""),
        "--skip-check",
    )
    for key, value in [("WP_ENVIRONMENT_TYPE", "local"), ("DISABLE_WP_CRON", "true")]:
        wp("config", "set", key, value, *(["--raw"] if value == "true" else []))
    wp("db", "create")
    wp(
        "core",
        "install",
        "--url=http://127.0.0.1:18764",
        "--title=MarkBridge CI",
        "--admin_user=markbridge_ci",
        "--admin_password=synthetic-ci-only-password",
        "--admin_email=ci@example.invalid",
        "--skip-email",
    )
    version = wp("core", "version")
    if version != pins["wordpress"]["version"]:
        raise RuntimeError("Unexpected WordPress version")
    if args.with_test_locales:
        language = dependency("wordpress_zh_CN", downloads, pins)
        if pins["wordpress_zh_CN"]["version"] != version:
            raise RuntimeError("Core language version differs from WordPress")
        files = install_test_locales(language, site)
        if (
            wp(
                "eval",
                "echo in_array('zh_CN', get_available_languages(), true) ? 'available' : 'missing';",
            )
            != "available"
        ):
            raise RuntimeError("Actual WordPress Chinese locale is unavailable")
        (downloads / "test-locale-proof.json").write_text(
            json.dumps(
                {
                    "wordpress": version,
                    "archive_sha256": pins["wordpress_zh_CN"]["sha256"],
                    "files": files,
                    "site_language_changed": False,
                    "user_locale_changed": False,
                },
                indent=2,
                sort_keys=True,
            )
            + "\n"
        )
    print("Installed pinned synthetic WordPress " + version)


if __name__ == "__main__":
    main()
