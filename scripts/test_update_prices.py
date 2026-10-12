"""Self-check for the retry and stale-source rules of update_prices.py.  Run:  python scripts/test_update_prices.py"""

import io
import sys
import urllib.error
from datetime import datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import update_prices as up

up.time.sleep = lambda s: None  # no real pauses


def fake_urlopen(*answers):
    """urlopen stand-in: each call returns/raises the next answer (an int = HTTP error code)."""
    calls = []

    def urlopen(req, timeout=0):
        calls.append(req)
        a = answers[min(len(calls), len(answers)) - 1]
        if isinstance(a, int):
            raise urllib.error.HTTPError(req.full_url, a, "x", {}, io.BytesIO(b""))
        return io.BytesIO(a)
    up.urllib.request.urlopen = urlopen
    return calls


# 403 is retried and the next answer is used (the rompetrol.ge case of runs #70 and #73)
calls = fake_urlopen(403, 403, b"ok")
assert up.fetch("https://x.test") == b"ok" and len(calls) == 3
assert "Accept-language" in calls[0].headers  # browser-like headers are sent

# a 404 is not temporary: raised at once; a 403 that never clears gives up after FETCH_TRIES
calls = fake_urlopen(404, b"ok")
try:
    up.fetch("https://x.test"); raise SystemExit("404 should raise")
except urllib.error.HTTPError:
    assert len(calls) == 1
calls = fake_urlopen(403)
try:
    up.fetch("https://x.test"); raise SystemExit("persistent 403 should raise")
except urllib.error.HTTPError:
    assert len(calls) == up.FETCH_TRIES

# staleness: recent kept prices are a blip, old / unreadable ones are not
now = datetime.now(up.TBILISI)
at = lambda h: {"checkedAt": (now - timedelta(hours=h)).isoformat(timespec="minutes")}
assert not up.is_stale(at(2), now) and up.is_stale(at(up.STALE_HOURS + 1), now)
assert up.is_stale({}, now) and up.is_stale({"checkedAt": "garbage"}, now)


# main(): a failing source gives exit 0 while its kept prices are fresh, 1 once they are stale
def run_main(prev_company):
    def boom():
        raise urllib.error.HTTPError("u", 403, "Forbidden", {}, io.BytesIO(b""))
    up.READERS = {"Rompetrol": boom}
    up.load_previous = lambda: {"Rompetrol": prev_company}
    up.OUT = up.ROOT / "data" / "_test_prices.js"
    try:
        return up.main()
    finally:
        up.OUT.unlink(missing_ok=True)


kept = {"super": {"name": "efix Super", "price": 4.5}}
assert run_main({**kept, **at(5)}) == 0
assert run_main({**kept, **at(up.STALE_HOURS + 1)}) == 1
print("all checks passed")
