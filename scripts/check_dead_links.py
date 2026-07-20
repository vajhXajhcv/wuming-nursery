import os
import re
import sys
from pathlib import Path
from urllib.parse import urlparse

DIST_DIR = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("dist")
IGNORED_SCHEMES = {"http", "https", "mailto", "tel", "javascript", "data"}

broken = []

for html_file in DIST_DIR.rglob("*.html"):
    text = html_file.read_text(encoding="utf-8", errors="ignore")

    for attr in ("href", "src"):
        pattern = rf'{attr}=["\']([^"\']+)["\']'
        for match in re.finditer(pattern, text):
            url = match.group(1).strip()
            parsed = urlparse(url)

            if not url or parsed.scheme in IGNORED_SCHEMES:
                continue
            if parsed.netloc:
                continue

            path = parsed.path
            if path.startswith("/"):
                target = DIST_DIR / path.lstrip("/")
            else:
                target = html_file.parent / path

            if target.is_dir():
                target = target / "index.html"

            if not target.exists():
                broken.append((str(html_file.relative_to(DIST_DIR)), attr, url))

if broken:
    print(f"BROKEN_LINKS_FOUND: {len(broken)}")
    for page, attr, url in broken:
        print(f"  {page} [{attr}] {url}")
    sys.exit(1)
else:
    print("NO_BROKEN_LINKS")
    sys.exit(0)
